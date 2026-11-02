NODE_ENV=development
PORT=3000

# שורת החיבור המרכזית שהקוד דורש
DATABASE_URL=postgres://postgres:039089082s@localhost:5432/transfer_db

# משתני החיבור הנפרדים
PGHOST=localhost
PGPORT=5432
PGDATABASE=transfer_db
PGUSER=postgres
PGPASSWORD=039089082s
PG_POOL_MAX=10

# הגדרות אבטחה וטוקנים
JWT_SECRET=this_is_a_very_secure_long_secret_key_with_more_than_32_characters_12345
JWT_EXPIRES_IN=1h
COOKIE_SECURE=false
CORS_ORIGIN=http://localhost:3000