# Deploying to Bluehost (visitor.woodhallcap.com)

Audience: whoever holds the Bluehost cPanel login. Takes about 20 minutes the first time.

## What you need

- cPanel access for the account that hosts woodhallcap.com (box5735).
- The deploy zip: on a machine with Node 20+, run `scripts/package.sh` → `build/visitor-deploy.zip`.

## First deploy

1. **PHP version.** cPanel → *MultiPHP Manager* → set `visitor.woodhallcap.com` to **PHP 8.1 or newer**. Check *MultiPHP INI Editor* has `pdo_mysql` (it is on by default).
2. **Subdomain.** cPanel → *Domains* → make sure `visitor.woodhallcap.com` exists and note its **document root** (e.g. `/home/CPANELUSER/visitor.woodhallcap.com`).
3. **Database.** cPanel → *MySQL Databases*: create a database (e.g. `CPANELUSER_visitor`), a user with a long random password, and add the user to the database with **ALL PRIVILEGES**.
4. **Upload.** cPanel → *File Manager* → open the document root → *Upload* `visitor-deploy.zip` → *Extract*. Move the **contents** of the extracted `visitor/` folder up into the document root (so `index.html` and `.htaccess` sit directly in it), then delete the empty `visitor/` folder and the zip. Enable *Show Hidden Files* to see `.htaccess`.
5. **Configuration.** In the document root, copy `config.local.example.php` to `config.local.php` and fill in the database name, user and password from step 3. Keep `site_url` as `https://visitor.woodhallcap.com` and `cookie_secure` as `true`.
6. **Create the tables.** cPanel → *Terminal* (or SSH): `cd ~/visitor.woodhallcap.com && php migrations/migrate.php` → `Applied: 001_init.sql, 002_indexes.sql`. If `php` is an older version in the terminal, use the full path shown in MultiPHP Manager (e.g. `/usr/local/bin/ea-php81`).
7. **SSL.** cPanel → *SSL/TLS Status* → run **AutoSSL** for `visitor.woodhallcap.com` and wait for a green padlock.
8. **First IT account.** In the terminal: `php scripts/create-it-user.php --name="IT Person" --email="it@woodhallcap.com"`. Open the printed link within 72 hours to set the password, sign in, then invite admins and everyone else from **Users**.

## Check it (after every deploy)

Replace the host if different. Each command should print the status shown.

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://visitor.woodhallcap.com/                    # 200
curl -s -o /dev/null -w "%{http_code}\n" https://visitor.woodhallcap.com/login               # 200 (front-end route)
curl -s https://visitor.woodhallcap.com/api/health                                           # {"ok":true}
curl -s -o /dev/null -w "%{http_code}\n" https://visitor.woodhallcap.com/config.local.php    # 403
curl -s -o /dev/null -w "%{http_code}\n" https://visitor.woodhallcap.com/lib/db.php          # 403
curl -s -o /dev/null -w "%{http_code}\n" https://visitor.woodhallcap.com/storage/            # 403
curl -s -o /dev/null -w "%{http_code}\n" https://visitor.woodhallcap.com/migrations/001_init.sql  # 403
curl -s -o /dev/null -w "%{http_code}\n" http://visitor.woodhallcap.com/                     # 301 (to https)
curl -sI https://visitor.woodhallcap.com/ | grep -i content-security-policy                  # header present
```

If any of the 403 checks returns 200, stop and fix `.htaccess` before anyone uses the site: it means server files are downloadable.

## Updating

1. Build a new zip. 2. Upload and extract it next to the live files, then copy everything **except** `config.local.php` and `storage/` over the live document root. 3. Run `php migrations/migrate.php` (it only applies new migrations). 4. Run the checks above.

## Troubleshooting

- **Blank page or 500:** check `storage/logs/php-error.log` (File Manager) and cPanel → *Errors*.
- **Everyone is signed out after a few minutes:** confirm `storage/sessions/` exists and is writable by PHP (it is created automatically on the first request).
- **"Something went wrong" on sign-in:** usually the database settings in `config.local.php`.
