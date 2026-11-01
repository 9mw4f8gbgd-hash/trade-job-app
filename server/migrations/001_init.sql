CREATE TABLE shops (
  id serial PRIMARY KEY,
  name text NOT NULL,
  hourly_rate numeric(10,2) NOT NULL DEFAULT 95,
  tax_rate numeric(6,3) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE users (
  id serial PRIMARY KEY,
  shop_id integer NOT NULL REFERENCES shops(id),
  email text NOT NULL UNIQUE,
  name text NOT NULL DEFAULT '',
  password_hash text
);
CREATE TABLE sessions (
  token text PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  shop_id integer NOT NULL REFERENCES shops(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE parts (
  id serial PRIMARY KEY,
  shop_id integer NOT NULL REFERENCES shops(id),
  name text NOT NULL,
  price numeric(10,2) NOT NULL DEFAULT 0
);
CREATE TABLE jobs (
  id serial PRIMARY KEY,
  shop_id integer NOT NULL REFERENCES shops(id),
  customer_name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'new',
  scheduled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE visits (
  id serial PRIMARY KEY,
  shop_id integer NOT NULL REFERENCES shops(id),
  job_id integer NOT NULL REFERENCES jobs(id),
  client_id text NOT NULL UNIQUE,
  notes text NOT NULL DEFAULT '',
  labor_hours numeric(8,2) NOT NULL DEFAULT 0,
  items text NOT NULL DEFAULT '[]',
  photos text NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE quotes (
  id serial PRIMARY KEY,
  shop_id integer NOT NULL REFERENCES shops(id),
  job_id integer NOT NULL REFERENCES jobs(id),
  token text NOT NULL UNIQUE,
  items text NOT NULL,
  labor_hours numeric(8,2) NOT NULL,
  hourly_rate numeric(10,2) NOT NULL,
  tax_rate numeric(6,3) NOT NULL,
  total numeric(12,2) NOT NULL,
  notes text NOT NULL DEFAULT '',
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE parts_used (
  id serial PRIMARY KEY,
  shop_id integer NOT NULL REFERENCES shops(id),
  job_id integer NOT NULL UNIQUE REFERENCES jobs(id),
  items text NOT NULL DEFAULT '[]',
  labor_hours numeric(8,2) NOT NULL DEFAULT 0
);
CREATE TABLE invoices (
  id serial PRIMARY KEY,
  shop_id integer NOT NULL REFERENCES shops(id),
  job_id integer NOT NULL REFERENCES jobs(id),
  token text NOT NULL UNIQUE,
  items text NOT NULL,
  labor_hours numeric(8,2) NOT NULL,
  hourly_rate numeric(10,2) NOT NULL,
  tax_rate numeric(6,3) NOT NULL,
  total numeric(12,2) NOT NULL,
  due_date date NOT NULL,
  viewed_at timestamptz,
  paid_at timestamptz,
  paid_method text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_shop ON jobs(shop_id);
CREATE INDEX invoices_shop ON invoices(shop_id);
