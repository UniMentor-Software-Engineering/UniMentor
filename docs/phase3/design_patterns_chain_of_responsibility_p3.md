# Design Patterns: Chain of Responsibility (P3 - Authentication and Admin)

**Problem:** 
While developing the Authentication and Administration use cases (CU-01, CU-02, CU-13, CU-14), we faced the challenge of multiple and sequential request validations. Every request to a protected route needed to verify the existence and validity of a token (JWT), check if the user's role had sufficient permissions, validate the CSRF token to prevent forgery attacks, and finally, register the action in the audit logs. Implementing all this logic inside the controllers of each route would generate "spaghetti code": massive controllers, high code duplication, poor maintainability, and a clear violation of the Single Responsibility Principle (SRP).

**Solution:**
We implemented the **Chain of Responsibility** structural design pattern utilizing the native *middleware* architecture provided by Express.js. Instead of using a monolithic controller, the incoming request (`req`) passes through a chain of independent handlers. 
Each middleware in the chain has a single responsibility (e.g., `verifyJWT` or `requireRole`) and decides whether to reject the request (returning a 401 or 403 error) or to pass it to the next link in the chain using the `next()` function. 

Example of the chain implemented in the router:
`router.post('/admin/ban', verifyJWT, requireRole('admin'), csrfProtection, auditLog, banUserController);`

**Benefits:**
* **Decoupling and Maintainability:** The business logic (the final controller) is completely isolated from the security and auditing logic.
* **High Reusability:** The JWT, roles, and CSRF middlewares are written only once and can be composed in different combinations for any route across the system.
* **Scalability:** If we need to add a new security layer in the future (e.g., IP blocking or rate limiting), we only need to insert a new link into the chain without modifying the existing code.