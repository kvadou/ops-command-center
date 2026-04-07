-- Extended tutor profile fields for STT parity
-- Languages, previous experience, availability notes, emergency contact

ALTER TABLE contractors ADD COLUMN IF NOT EXISTS profile_languages TEXT[];
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS profile_previous_experience TEXT;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS profile_availability_notes TEXT;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(255);
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(50);
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS emergency_contact_relation VARCHAR(50);
