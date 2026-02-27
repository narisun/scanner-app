CREATE TABLE IF NOT EXISTS partners (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    mod_user VARCHAR(50) DEFAULT 'system',
    mod_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    partner_id INTEGER REFERENCES partners(id) ON DELETE CASCADE,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    mod_user VARCHAR(50) DEFAULT 'system',
    mod_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scans (
    id SERIAL PRIMARY KEY,
    partner_id INTEGER REFERENCES partners(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    qr_url TEXT,
    address_text TEXT,
    qr_image_src TEXT,
    address_image_src TEXT,
    status VARCHAR(20) DEFAULT 'PENDING',
    notes TEXT,
    mod_user VARCHAR(50) DEFAULT 'system',
    mod_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 1. Insert Default Partner
INSERT INTO partners (name) VALUES ('Bay Alarm Medical') ON CONFLICT (name) DO NOTHING;

-- 2. Insert Default Admin User linked to the Partner
-- (Using the bcrypt hash for 'ScannerAdmin123!')
INSERT INTO users (partner_id, username, password_hash, mod_user) 
VALUES (
    (SELECT id FROM partners WHERE name = 'Bay Alarm Medical'), 
    'admin', 
    '$2b$10$wT0XkI/J8TzTjV.X3nZ2.uR6q1G.E.lZ.kH.aZ3r5e2s8t/m3qH6a', 
    'system'
)
ON CONFLICT (username) DO NOTHING;