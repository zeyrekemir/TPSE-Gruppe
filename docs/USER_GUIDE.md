# PEARL Robot Hub – User Guide

*Deutsche Version: [BENUTZERHANDBUCH.md](BENUTZERHANDBUCH.md)*

The Robot Hub is the one place for all robots of the PEARL lab: who has which robot when, whether it is available or broken, where its documentation lives, and what was last done with it.

## 1. Signing in

1. Open the Robot Hub address in your browser.
2. Before sign-in a short scroll story shows what the hub does: as you scroll, a robot arm takes four feature modules off a conveyor belt and puts them on display. **Skip to sign-in** (top right) jumps past it.
3. Sign in with username and password. If LDAP is set up, use your normal lab/TU account.

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

Everything about one robot: type, location, responsible person, documentation link and description. Below are upcoming reservations, maintenance and fault reports, and experiment logs.

Admins and the robot's **responsible person** can change its status right here, e.g. to "In maintenance".

## 4. Reserving a robot

**In the calendar** (*Calendar* in the menu):

1. In week or day view, drag across the time you need.
2. Pick the robot, optionally add a purpose, and click **Save**.

You can also use **New reservation** at the top of the calendar, or **Reserve** on a robot's page.

**If the slot is taken**, the Hub shows who you clash with and suggests the **next free slot** of the same length. Click **Use this slot** to take it.

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

Under *Experiments*, or on a robot's page: enter date, title, description and result (*Success*, *Partial*, *Failure*). This shows what was last done with a robot. You can delete your own entries.

## 7. Appearance

The sliders icon at the bottom of the sidebar opens the settings:

- **Light / Dark**
- **Glass opacity**: from *Clear* (very see-through) to *Solid*. If text is hard to read, move it to the right.
- **Blur** of the glass effect
- **Animated background** on/off
- **Show welcome story before sign-in** on/off, or **Watch welcome story**

These settings apply to the current browser only.

## 8. For admins

**Robots**: **New robot** on the overview. A robot's page has **Edit** and **Delete**. Deleting a robot also deletes its reservations, reports and logs.

**Users** (*Users* in the menu):
- Create local accounts with a password (at least 8 characters) and a role.
- Switch roles between *Member* and *Admin*, or deactivate accounts. Deactivated users are signed out immediately.
- LDAP accounts are created automatically on first sign-in. If an admin group is configured, the directory decides the role on every sign-in.
- You cannot demote or deactivate yourself, so there is always an admin left.

## 9. Permissions

| Action | Who |
|---|---|
| Add/delete robots, manage users | admin |
| Change a robot's status, location, description | admin, responsible person |
| Reserve, report issues, write logs, comment | every member |
| Change/delete a reservation or log | its owner, admin |
| Change a report's status or assignee | admin, reporter, assignee, robot's responsible person |

## 10. FAQ

**I got signed out.** A sign-in lasts 12 hours. Just sign in again.

**I can't reserve a robot.** It is probably *defect* or *retired*. The status is shown on its card.

**My booking is rejected although the calendar looks free.** Is a filter active (robot or *Only mine*)? Other bookings are hidden then. The message names the clash and suggests a free slot.

**The scroll story is in the way.** Turn off *Appearance* → *Show welcome story before sign-in*. It is skipped anyway when your operating system's "reduce motion" setting is on.
