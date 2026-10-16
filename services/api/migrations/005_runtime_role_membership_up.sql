-- PostgreSQL 16+ grants newly created roles to their creator with SET FALSE.
-- Allow the configured migration-owner login to enter the restricted runtime
-- role explicitly; do not inherit its grants outside a transaction.
grant nestful_runtime to current_user with inherit false, set true;
