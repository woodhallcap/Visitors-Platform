# Manual test checklist (before email)

Audience: anyone checking the screens before go-live. About 30 minutes.

## Set up (local)

```bash
php migrations/migrate.php
php scripts/seed-demo.php              # one account per role + sample visits; password in storage/demo-accounts.txt
php -S localhost:8000 api/index.php    # API
cd frontend && npm run dev             # app at http://localhost:5173 (or the port Vite prints)
php tests/e2e/run.php                  # optional: the automated walkthrough of every role (51 checks)
```

Accounts (all share the password in `storage/demo-accounts.txt`):

| Role | Email |
|---|---|
| IT | demo-it@example.test |
| Admin | demo-admin@example.test |
| Reception | demo-reception@example.test |
| Security | demo-security@example.test |
| Staff (Finance) | demo-staff@example.test |
| Staff (Legal) | demo-staff2@example.test |

Re-run `php scripts/seed-demo.php` any time to reset the sample visits. It refuses to run against the live site.

Check each screen at **desktop width** and at **phone width** (browser dev tools, ~390 px): nothing cut off, no sideways scrolling.

## Sign-in

- [ ] The page is a full-screen split: office photo with logo and "Welcome" on the left, form card on the right with header and footer.
- [ ] A wrong password shows "Email or password is incorrect."
- [ ] Each account lands on its home page: IT → Dashboard, Admin → Users, Reception → Today, Security → On site now, Staff → My visitors.

## Staff (demo-staff)

- [ ] **My visitors** shows Upcoming (today and later) and Past.
- [ ] **Book a visitor**: book someone for today; the success message appears and the form clears.
- [ ] Leaving **Gender** empty shows "Choose the visitor's gender."; it offers only Female and Male.
- [ ] The new visit appears under Upcoming. **Edit** it (change the arrival time) and **Cancel** another.
- [ ] Opening `/users` shows "No access".

## Reception (demo-reception)

- [ ] **Today**: Expected, On site and Left columns show the seeded visitors; the overstayed contractor (Grace Okon) is flagged copper.
- [ ] **Check in** the staff booking from above with a badge number; it moves to On site.
- [ ] **Check out** a visitor; they move to Left.
- [ ] **Book walk-in**: date and time are pre-filled; gender is required; pick a host; you return to Today and the visitor is under Expected.
- [ ] **All visits**: search by name; cancel a future booking.

## Security (demo-security)

- [ ] **On site now** lists checked-in visitors with badges and the overstay flag; it refreshes on its own (wait 30 s after a reception check-in).
- [ ] **Today's log** lists check-ins and check-outs in time order.
- [ ] **History** searches past and future visits; there are no edit or cancel buttons.

## IT (demo-it)

- [ ] **Dashboard**: five stat cards, the per-day and by-hour charts, and the visitor type, gender (with the female/male share) and department lists; hovering a column shows a tooltip.
- [ ] Change the range (e.g. last 7 days) → the numbers update; a backwards range shows an error.
- [ ] **Download CSV** opens in Excel with readable phone numbers and a Gender column.
- [ ] **Users**: invite an Admin → copy the set-password link → open it in a private window → set a password → sign in.
- [ ] **Today** and **All visits** show visits but no check-in, edit or cancel buttons.

## Admin (demo-admin)

- [ ] **Users**: admin and IT accounts show "Managed by IT"; the invite role list offers only Staff, Reception and Security.
- [ ] **Departments**: add, rename, deactivate and reactivate one.
- [ ] Disable a user, then in their window click anything → they are sent back to sign-in.
- [ ] **Book walk-in** is in the sidebar and works.

Note anything that looks wrong with the page, the account used and a screenshot.
