## 3. Architectural Design: Decision Justification (ADRs)

Below are the final **Architecture Decision Records (ADRs)** for the UniMentor project, resolving the technical uncertainties regarding security, user interface components, and communication services.

---

### 🛡️ ADR 1: Authentication Token (JWT) Handling and Transmission

* **Context:** The UniMentor system requires user authentication and role management (Student, Tutor, Admin). Since our Frontend (HTML/CSS/JS hosted on Vercel) and Backend (Node.js/Express hosted on Render) are decoupled, we need a secure method to transmit and store the JSON Web Token (JWT) to maintain user sessions without exposing the system to critical vulnerabilities.
* **Options considered:**
  1. *JWT in the Authorization Header (stored in `localStorage`):* Easy to implement and very common in REST APIs. However, `localStorage` is accessible via JavaScript, exposing the tokens to Cross-Site Scripting (XSS) attacks.
  2. *JWT in HttpOnly Cookies:* The backend sends the token inside a cookie configured with the `HttpOnly` and `Secure` flags. This prevents client-side JavaScript from reading the token, drastically mitigating the risk of XSS attacks.

> ✅ **Outcome: We chose to use HttpOnly Cookies.**
> Although it requires properly configuring CORS headers in the Node.js/Express backend to accept credentials from the Vercel domain, the security impact is invaluable. It protects student and tutor accounts against session hijacking, fully complying with modern web security standards.

---

### 📅 ADR 2: Interactive Calendar System Library

* **Context:** One of the core features of UniMentor is providing an interactive calendar for tutors to set their availability and students to book appointments, preventing schedule conflicts. Our frontend stack relies entirely on vanilla HTML, CSS, and JavaScript, without frameworks like React or Angular.
* **Options considered:**
  1. *FullCalendar (Vanilla JS Version):* A robust, highly customizable library with excellent documentation and native support for pure JavaScript without additional framework dependencies.
  2. *Toast UI Calendar:* Another powerful alternative, but its integration and customization can sometimes be more complex for rapid prototyping.
  3. *Custom-built calendar:* Building the grid, date handling, and event collision logic entirely from scratch.

> ✅ **Outcome: We chose FullCalendar.**
> Developing a calendar from scratch poses a very high technical risk and would consume excessive development time. FullCalendar fits perfectly into our vanilla JS stack and provides built-in event collision and time zone management logic. This directly mitigates our main technical risk identified in the project proposal.

---

### ✉️ ADR 3: Email Notification Provider

* **Context:** The system requires sending basic email notifications to confirm appointments and send reminders to both students and tutors. The backend is built using Node.js.
* **Options considered:**
  1. *Nodemailer with a basic SMTP server (e.g., Gmail):* Nodemailer is a standard Node.js library. Using it with a personal Gmail account is free and easy to set up for development environments, but it has strict daily sending limits and emails often end up in the spam folder.
  2. *SendGrid (API):* An enterprise-grade transactional email service. It offers a generous free tier (100 emails/day indefinitely), uses a REST API instead of traditional SMTP (which is usually faster), and guarantees better deliverability rates.

> ✅ **Outcome: We chose SendGrid.**
> Since UniMentor is a platform where appointment reminders and confirmations are critical to the success of the tutoring sessions, we cannot afford for emails to land in spam folders or for the server to block our account due to sending limits. Integrating SendGrid via its official Node.js SDK provides professional-grade scalability and reliability from day one.
