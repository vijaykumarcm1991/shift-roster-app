CREATE TABLE employees (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    team VARCHAR(100),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE shifts (
    id SERIAL PRIMARY KEY,
    shift_code VARCHAR(10),
    shift_name VARCHAR(50),
    start_time TIME,
    end_time TIME,
    color VARCHAR(20)
);

CREATE TABLE rosters (
    id SERIAL PRIMARY KEY,
    month INTEGER,
    year INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE roster_entries (
    id SERIAL PRIMARY KEY,
    roster_id INTEGER REFERENCES rosters(id),
    employee_id INTEGER REFERENCES employees(id),
    date DATE,
    shift_id INTEGER REFERENCES shifts(id),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);