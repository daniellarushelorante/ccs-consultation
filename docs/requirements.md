# Requirements Document: CCS Consultation Booking System

## 1. Users
- **Student**: registers, finds faculty, books and cancels consultations.
- **Administrator**: manages faculty accounts, reviews all records and exports them.
- **Faculty**: sets availability and leave, approves or declines requests, views daily schedule.

## 2. Stakeholders
Students, faculty, the College of Computing Studies dean and department heads, the registrar/IT office who maintain the system, and the project team.

## 3. Functional Requirements
1. Users choose a role (student or faculty) on the login page and log in with ID/email and password.
2. Students can create an account with validated details; duplicates (Student ID, email) are rejected.
3. Sessions persist until logout; protected pages require login and the correct role.
4. Students see available professors on Home and can search by name or subject.
5. Students can open a professor's schedule, choose a day and a time, enter an optional topic and confirm.
6. A confirmed booking is stored as pending and appears in the professor's requests; a "BOOKING CONFIRMED" message is shown.
7. The system prevents double-booking of a slot and bookings in the past.
8. Students can view and cancel their appointments.
9. Faculty see pending, today, later-this-week and completed counts, and can approve or decline each request.
10. Faculty see today's schedule with student names and topics.
11. Faculty can add or remove slots and set a return date when on leave; students can ask to be notified.
12. Administrators can add, edit (including password reset) and delete professors, and set initial consultation hours.
13. Administrators can view and delete students, and view all bookings with search, status and date filters.
14. Administrators can cancel bookings and export the filtered records to CSV.
15. Administrator actions are written to an activity log shown on the admin dashboard.

## 4. Non-Functional Requirements
- **Security**: bcrypt-hashed passwords, parameterized queries, httpOnly session cookie, role-based access.
- **Usability**: responsive layout, visible keyboard focus, clear error messages.
- **Reliability**: data persisted in SQLite; refresh or restart does not lose records.
- **Performance**: pages respond in under one second for a department-sized dataset.
- **Maintainability**: routes, views, and utilities separated by responsibility.

## 5. Use Cases

**UC1 Register a student account**
Actor: Student. Precondition: no existing account. Steps: open Login, choose Student, click Create an account, fill the form, submit. Result: account stored, redirected to login with a success message; invalid input shows specific errors.

**UC2 Book a consultation**
Actor: Student. Precondition: logged in. Steps: on Home click View schedule, choose a day, choose a time, add a topic, click Confirm booking. Result: booking saved as pending, BOOKING CONFIRMED shown, request appears for the professor.

**UC3 Review a request**
Actor: Faculty. Precondition: logged in with a pending request. Steps: open Dashboard, click Approve or Decline. Result: status updates; approved sessions appear in the schedule and the student's appointments.

**UC4 Manage availability**
Actor: Faculty. Precondition: logged in. Steps: open My availability, add or remove slots or set a return date. Result: students only see the updated slots.

**UC5 Add a professor**
Actor: Administrator. Precondition: logged in as admin. Steps: open Professors, click Add professor, enter name, User ID, email, subject, room, password and consultation hours, submit. Result: account and slots stored, professor appears in the list and can log in; duplicates or invalid input show specific errors.

**UC6 Review records**
Actor: Administrator. Steps: open Records, filter by status, date or search text, optionally Export CSV. Result: matching bookings are listed or downloaded.

**UC7 Restricted access**
Actor: any. Steps: type a protected URL without the right role. Result: redirected to login or shown a 403 page.
