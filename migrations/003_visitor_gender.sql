-- Visitor gender (female or male), required on every booking from now on. Older visits stay NULL ("not recorded").
ALTER TABLE visits ADD COLUMN visitor_gender ENUM('female','male') NULL AFTER visitor_type;
