CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    team VARCHAR(100),
    status VARCHAR(20) DEFAULT 'active',
    employee_code VARCHAR(50) UNIQUE,
    email VARCHAR(100) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shifts (
    id SERIAL PRIMARY KEY,
    shift_code VARCHAR(10),
    shift_name VARCHAR(50),
    start_time TIME,
    end_time TIME,
    color VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS rosters (
    id SERIAL PRIMARY KEY,
    month INTEGER,
    year INTEGER,
    status VARCHAR(10) DEFAULT 'DRAFT',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS roster_entries (
    id SERIAL PRIMARY KEY,
    roster_id INTEGER REFERENCES rosters(id),
    employee_id INTEGER REFERENCES employees(id),
    date DATE,
    shift_id INTEGER REFERENCES shifts(id),
    comment TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE,
    password VARCHAR(255),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO shifts (shift_code, shift_name)
VALUES
('S1','Morning'),
('S2','Afternoon'),
('S3','Night'),
('G','General'),
('WO','Week Off'),
('CO','Comp Off'),
('GH','Holiday'),
('LV','Leave')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    employee_id INT,
    date DATE,
    old_shift VARCHAR(10),
    new_shift VARCHAR(10),
    changed_by VARCHAR(100),
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);