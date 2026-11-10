# PEARL Robot Hub – User Guide

*Deutsche Version: [BENUTZERHANDBUCH.md](BENUTZERHANDBUCH.md)*

The Robot Hub is the one place for all robots of the PEARL lab: who has which robot when, whether it is available or broken, where its documentation lives, and what was last done with it.

## 1. Signing in

1. Open the Robot Hub address in your browser.
2. Before sign-in a short scroll story shows what the hub does: as you scroll, a Franka Research 3 is assembled joint by joint, and one feature of the hub is presented with each stage. **Skip to sign-in** (top right) jumps past it.
3. Sign in with **TU-ID** (the button above the form), or with username and password. If LDAP is set up, your normal lab/TU account works too.

After 5 wrong passwords in a row, the account is locked for a few minutes. Wait, then try again.

Language (**DE/EN**) and appearance can be changed at any time at the bottom of the sidebar. The language is saved with your account.

## 2. Robot overview

The start page shows every robot as a card. Four tiles at the top count robots by status:

| Status | Meaning |
|---|---|
| 🟢 **Available** | free and ready |
| 🔵 **Reserved** | currently in use by a running reservation |
| 🟡 **In maintenance** | being serviced; can be booked for later |
| 🔴 **Defect** | not usable, cannot be reserved |
| ⚪ **Retired** | permanently out of service |

- Click a tile to filter the list, click it again to clear the filter.
- The search box looks at name, type and location.
- Click a card to open the robot's page.

## 3. Robot page

Everything about one robot: type, location, responsible person, documentation link, its **specification** (firmware and operating system), its **equipment** (gripper, cameras, sensors, ...), a description, and **Last used by**: who had the robot last, and when. Below are upcoming reservations, maintenance and fault reports, and experiment logs.

Admins and the robot's **responsible person** can change its status right here, e.g. to "In maintenance". With **Edit**, the responsible person can also keep the location, description, firmware, operating system and equipment up to date (one item of equipment per line).

## 4. Reserving a robot

**In the calendar** (*Calendar* in the menu):

1. In week or day view, drag across the time you need.
2. Pick the robot, optionally add a purpose, and click **Save**.

You can also use **New reservation** at the top of the calendar, or **Reserve** on a robot's page.

**If the slot is taken**, the Hub shows who you clash with and suggests the **next free slot** of the same length. Click **Use this slot** to take it.

**Staff before students:** members are either *students* or *staff* (set by an admin). If staff need a slot that only students have booked, the Hub offers **Replace these bookings**. The students' bookings are then cancelled, and they are told by e-mail. When you move a booking in the calendar onto such a slot, the Hub asks first. Admins can replace anyone's booking except another admin's. Students cannot replace bookings, and staff cannot replace other staff.

**Changing and deleting:**
- Drag your own bookings to move them, or drag their bottom edge to change the length. Overlaps are checked here too.
- Click a booking in the calendar to delete it.
- The selector at the top filters by robot, **Only mine** shows just your bookings.

Defect or retired robots cannot be reserved.

## 5. Reporting faults and maintenance

Under *Maintenance*, or on a robot's page:

1. Choose the **kind**: *Fault* (something is broken) or *Maintenance* (planned work such as calibration).
2. Enter a title and description.
3. For faults you can tick **Mark robot as defect**. Nobody can then reserve it until the issue is resolved.

Each report has a status: **Open → In progress → Resolved**. Click a report to see its history of status changes and comments.

- **Every member** can comment.
- **Status and assignee** can be changed by admins, the reporter, the assignee and the robot's responsible person.
- When the **last open report** of a defect or maintenance robot is resolved, the robot automatically becomes **available** again.

## 6. Experiment logs

Under *Experiments*, or on a robot's page: enter date, title, description, the **procedure** (step by step: setup, parameters, what was run) and result (*Success*, *Partial*, *Failure*). This shows what was last done with a robot.

**Files**: with **Choose files** you attach plots, videos or configs to the entry, up to 10 files of 10 MB each. Later, **+ Add file** under an entry adds more. Everyone can download the files; the author and admins can remove them. You can delete your own entries, together with their files.

## 7. Live status

Robots that report in show a **Live status** box on their page: **Online** or **Offline**, the time of the **last report**, the **battery** level (if the robot has one) and a short message. The page refreshes it every 10 seconds. A robot counts as offline when it has not reported for a while (90 seconds by default).

The reports come from a small program on the robot's PC (`tools/robot_agent.py`), which sends a report every 30 seconds by default. Each robot has its own key:

1. An admin opens the robot's page and clicks **Create key** in the *Live status* box.
2. The key is shown **only once**. Copy it, together with the command shown below it.
3. Run that command on the robot's PC.

**New key** replaces the key (the old one stops working at once), and **Revoke key** turns the reports off. A robot without a key says "This robot does not report its status yet."

## 8. Statistics

*Statistics* in the menu shows how the lab is used. At the top, pick the **period**: 7, 30, 90 or 365 days.

- **Tiles**: booked hours, number of reservations, faults reported, average time to resolve a fault, the share of successful experiments, and the **uptime**: the share of time the robots were in service, with the hours they were out of service.
- **Utilisation by robot**: the share of lab hours (Mon–Fri 08–18) for which each robot was booked.
- **Booked hours per day** across the period.
- **When the lab is busy**: booked hours by weekday and hour. The stronger the blue, the busier the time, which helps you find a quiet slot.
- **Uptime and downtime by robot**: hours in service (available) and out of service (maintenance or defect). Every status change is recorded, so these numbers fill in over time.
- **Who books the robots**: the share of booked hours by students, staff and admins.
- **Most active users** by booked hours.

**Show as table**, next to *Booked hours per day*, shows those numbers as a table, for example for screen readers or for copying.

## 9. QR labels

Each robot can get a printed label with a QR code. Scanning it with a phone opens the robot's page, with its status, bookings and issues.

- **One label**: **QR label** on the robot's page, then **Print**.
- **All robots at once** (admins): **Print QR labels** on the overview, then **Print**.

Stick the label on the robot where people can see it.

## 10. TV board

**TV board** on the overview opens a full-screen board for a screen in the lab. Every robot is a large tile with its status, **who has it now** (and until when), **who is next today**, its live status and its open issues. At the top are the time and how many robots are free, in use or out of service. The board refreshes itself every 15 seconds and also works on a phone. Sign in once in the TV's browser and leave the page open. **Leave board** goes back to the hub.

## 11. Appearance

The sliders icon at the bottom of the sidebar opens the settings:

- **Light / Dark**
- **Glass opacity**: from *Clear* (very see-through) to *Solid*. If text is hard to read, move it to the right.
- **Blur** of the glass effect
- **Sound**: short sounds for clicks, success and errors, on/off
- **Animated headings**: headings that move gently, on/off
- **Show welcome story before sign-in** on/off, or **Watch welcome story**

These settings apply to the current browser only.

## 12. Your data and the legal pages

The links at the bottom of the sidebar open the **Imprint**, the **Privacy notice** and the **Accessibility statement**. They can also be opened without signing in.

On the privacy page you can **download your data**: a JSON file with everything the hub stores about you. If you want your account erased, ask an admin. Your name, e-mail and sign-in are then removed for good, and your future bookings are cancelled. Past bookings, reports and logs stay as lab records, without your name.

## 13. For admins

**Robots**: **New robot** on the overview. A robot's page has **Edit** and **Delete**. Deleting a robot also deletes its reservations, reports and logs.

**Users** (*Users* in the menu):
- Create local accounts with a password (at least 8 characters) and a role.
- Switch roles between *Member* and *Admin*, or deactivate accounts. Deactivated users are signed out immediately.
- LDAP accounts are created automatically on first sign-in. If an admin group is configured, the directory decides the role on every sign-in.
- You cannot demote or deactivate yourself, so there is always an admin left.
- **Group**: under the role, set whether a person is a *student* or *staff*. New people start as students. Staff can replace students' bookings (see chapter 4).
- **Erase** removes a person for good (see chapter 12). This cannot be undone.
- TU-ID accounts are created automatically on first sign-in, as members. The TU-IDs configured as admins on the server become admins.

**Live status keys** and **QR labels for all robots**: see chapters 7 and 9.

## 14. Permissions

| Action | Who |
|---|---|
| Add/delete robots, manage users | admin |
| Change a robot's status, location, description | admin, responsible person |
| Reserve, report issues, write logs, comment | every member |
| Change/delete a reservation or log | its owner, admin |
| Change a report's status or assignee | admin, reporter, assignee, robot's responsible person |

## 15. FAQ

**I got signed out.** A sign-in lasts 12 hours. Just sign in again.

**I can't reserve a robot.** It is probably *defect* or *retired*. The status is shown on its card.

**My booking is rejected although the calendar looks free.** Is a filter active (robot or *Only mine*)? Other bookings are hidden then. The message names the clash and suggests a free slot.

**The scroll story is in the way.** Turn off *Appearance* → *Show welcome story before sign-in*. It is skipped anyway when your operating system's "reduce motion" setting is on.
