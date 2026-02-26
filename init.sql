CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE scans (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    qr_code_id VARCHAR(100), 
    qr_url TEXT NOT NULL,
    address_text TEXT NOT NULL,
    qr_image_src TEXT,       
    address_image_src TEXT,  
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Inserts a default 'admin' user with password 'ScannerAdmin123!'
INSERT INTO users (username, password_hash) 
VALUES ('admin', '$2b$10$r9x/6u3Hq.k1V3z4YhQ/v.7C7R91w11n7n7n7n7n7n7n7n7n7n7n7');