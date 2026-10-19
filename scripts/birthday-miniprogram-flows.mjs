import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),storage=new Map([['nestful.modelVersion',2]]),toasts=[];
global.wx={getStorageSync:k=>storage.get(k)??'',setStorageSync:(k,v)=>storage.set(k,v),removeStorageSync:k=>storage.delete(k),getAccountInfoSync:()=>({miniProgram:{envVersion:'develop'}}),pageScrollTo:()=>{},showToast:o=>toasts.push(o.title),showLoading:()=>{},hideLoading:()=>{}};
const {api}=require('../apps/miniprogram/utils/api.js'),{session}=require('../apps/miniprogram/utils/session.js');
const {birthdayLabel,validBirthday}=require('../apps/miniprogram/utils/birthday.js');
const family={id:'family',name:'家'},me={id:'me',familyId:'family',role:'admin',displayName:'我',version:1};
session.setUser({id:'user'});session.setToken('test','2030-01-01');session.setFamily(family);session.setMember(me);
function page(name){let def;global.Page=d=>def=d;const path=require.resolve(`../apps/miniprogram/pages/${name}/index.js`);delete require.cache[path];require(path);const p={...def,data:structuredClone(def.data)};p.setData=(v,cb)=>{Object.assign(p.data,v);cb?.()};return p;}
const event=detail=>({detail}),input=(value,calendar='lunar',leapMonth=false)=>event({value,calendar,leapMonth});
assert.ok(validBirthday('0000-02-30','lunar'));assert.equal(validBirthday('0000-02-30','solar'),false);assert.equal(validBirthday('0000-06-31','lunar'),false);
assert.equal(birthdayLabel('0000-02-30','lunar'),'农历二月三十');assert.equal(birthdayLabel('1990-06-01','lunar',true),'农历闰六月初一');
console.log('PASS lunar month/day values survive without Gregorian Date normalization; labels identify the calendar');

let component;global.Component=d=>component=d;require('../apps/miniprogram/components/birthday-input/index.js');let change;
const c={data:{...structuredClone(component.data),value:'',calendar:'lunar',leapMonth:false,disabled:false},...component.methods,setData(v){Object.assign(this.data,v)},triggerEvent(name,v){assert.equal(name,'change');change=v;this.data.value=v.value;this.data.calendar=v.calendar;this.data.leapMonth=v.leapMonth;}};
c.onLunarChange(event({value:[1,29]}));assert.deepEqual(change,{value:'0000-02-30',calendar:'lunar',leapMonth:false});c.onLeapChange(event({value:true}));assert.equal(change.leapMonth,true);
c.onCalendarChange({currentTarget:{dataset:{calendar:'solar'}}});assert.deepEqual(change,{value:'',calendar:'solar',leapMonth:false});
c.onSolarChange(event({value:'2000-02-29'}));assert.equal(change.calendar,'solar');assert.equal(change.leapMonth,false);
c.data.disabled=true;change=null;c.onLunarChange(event({value:[5,0]}));c.onCalendarChange({currentTarget:{dataset:{calendar:'lunar'}}});assert.equal(change,null);
console.log('PASS component supports lunar February 30 and leap months, resets on calendar switch, and respects disabled state');

let p=page('reminders');const solar={...me,birthday:'1990-01-01',birthdayCalendar:'solar'},lunar={...me,id:'elder',birthday:'0000-06-01',birthdayCalendar:'lunar',birthdayLeapMonth:true};
p.setData({members:[solar,lunar],typeIndex:0});p.onMemberChange(event({value:'1'}));assert.equal(p.data.birthdayCalendar,'lunar');assert.equal(p.data.birthdayLeapMonth,true);
p.onMemberChange(event({value:'0'}));assert.equal(p.data.birthdayCalendar,'solar');assert.equal(p.data.birthdayLeapMonth,false);
p.onBirthdayChange(input('0000-02-30'));const body=p.buildReminderBodies(solar,me.id)[0];assert.equal(body.schedule.birthdayDate,'0000-02-30');assert.equal(body.schedule.birthdayCalendar,'lunar');assert.equal(body.schedule.birthdayLeapMonth,false);assert.deepEqual(body.targetMemberIds,[me.id]);assert.equal(body.frequency,'yearly');
p.onBirthdayChange(input('', 'solar'));assert.deepEqual(p.buildReminderBodies(solar,me.id),[]);
console.log('PASS member defaults include the calendar, while the explicit form calendar controls the created plan');

let finishMembers;api.listMembers=()=>new Promise(r=>finishMembers=r);session.setMembers(family.id,[solar]);p=page('reminders');const loading=p.loadMembers();p.onBirthdayChange(input('0000-02-30'));finishMembers({data:[solar]});await loading;assert.equal(p.data.birthdayDateInput,'0000-02-30');assert.equal(p.data.birthdayCalendar,'lunar');
console.log('PASS a delayed member refresh cannot overwrite a birthday being edited');

const plan={id:'plan',version:3,type:'birthday',title:'生日',dueAt:'2027-01-01T00:00:00.000Z',frequency:'yearly',schedule:{birthdayDate:'0000-06-01',birthdayCalendar:'lunar',birthdayLeapMonth:true,advanceDays:7,notifyOnDay:true}};
api.getReminderPlan=async()=>({data:plan});p=page('reminders');p.loadPage=async()=>{};await p.onEditPlan({currentTarget:{dataset:{planId:'plan'}}});assert.equal(p.data.editBirthdayCalendar,'lunar');assert.equal(p.data.editBirthdayLeapMonth,true);
let saved;api.updateReminderPlan=async(f,id,body)=>{saved=body;return {data:body}};p.onEditBirthdayChange(input('0000-02-30'));await p.onSavePlan();assert.equal(saved.schedule.birthdayCalendar,'lunar');assert.equal(saved.schedule.birthdayDate,'0000-02-30');assert.equal(saved.schedule.advanceDays,7);assert.equal(saved.version,3);
await p.onEditPlan({currentTarget:{dataset:{planId:'plan'}}});p.onEditBirthdayChange(input('2000-02-29','solar',true));await p.onSavePlan();assert.equal(saved.schedule.birthdayCalendar,'solar');assert.equal(saved.schedule.birthdayLeapMonth,false);
console.log('PASS plan edits retain advance settings and version while allowing calendar changes and clearing stale leap flags');

p=page('family');p.setData({selectedMember:me,editDisplayNameInput:'我',canEditSelectedProfile:true});p.loadFamilyData=async()=>{};
p.onBirthdayChange(input('0000-02-30'));let profile;api.updateMember=async(f,id,b)=>{profile=b;return {data:{...me,...b}}};await p.onSaveMemberProfile();assert.equal(profile.birthday,'0000-02-30');assert.equal(profile.birthdayCalendar,'lunar');assert.equal(profile.birthdayLeapMonth,false);
console.log('PASS member profile saves the same lunar month/day format as reminders');
delete global.Page;delete global.Component;delete global.wx;
