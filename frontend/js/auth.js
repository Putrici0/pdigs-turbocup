(function () {
    const USERS_KEY = "turbocup_users";
    const SESSION_KEY = "turbocup_session";
    const ROLE_PARTICIPANT = "participant";
    const ROLE_TOURNAMENT_ADMIN = "tournament_admin";
    const VALID_ROLES = [ROLE_PARTICIPANT, ROLE_TOURNAMENT_ADMIN];
    const DEFAULT_USER = {
        firstName: "Turbo",
        lastName: "Admin",
        username: "turboadmin",
        name: "Turbo Admin",
        email: "demo@turbocup.app",
        role: ROLE_TOURNAMENT_ADMIN,
        password: "TurboCup123!"
    };

    function readJson(key, fallback) {
        try {
            const raw = window.localStorage.getItem(key);
            if (!raw) {
                return fallback;
            }
            const parsed = JSON.parse(raw);
            return parsed || fallback;
        } catch (error) {
            return fallback;
        }
    }

    function writeJson(key, value) {
        window.localStorage.setItem(key, JSON.stringify(value));
    }

    function normalizeEmail(email) {
        return String(email || "").trim().toLowerCase();
    }

    function normalizeText(value) {
        return String(value || "").trim();
    }

    function normalizeUsername(username) {
        return normalizeText(username).toLowerCase();
    }

    function normalizeRole(role) {
        const normalizedRole = normalizeText(role).toLowerCase();
        return VALID_ROLES.includes(normalizedRole) ? normalizedRole : "";
    }

    function composeDisplayName(firstName, lastName) {
        return `${normalizeText(firstName)} ${normalizeText(lastName)}`.trim();
    }

    function sanitizeUser(user) {
        const displayName = normalizeText(user.name) || composeDisplayName(user.firstName, user.lastName) || normalizeText(user.username) || "Account";
        return {
            name: displayName,
            email: user.email,
            username: user.username || "",
            role: normalizeRole(user.role) || ROLE_PARTICIPANT
        };
    }

    function getUsers() {
        return readJson(USERS_KEY, []);
    }

    function saveUsers(users) {
        writeJson(USERS_KEY, users);
    }

    function seedDefaultUser() {
        const users = getUsers();
        const exists = users.some((user) => normalizeEmail(user.email) === normalizeEmail(DEFAULT_USER.email));
        if (!exists) {
            users.push(DEFAULT_USER);
            saveUsers(users);
        }
    }

    function getSession() {
        return readJson(SESSION_KEY, null);
    }

    function setSession(user) {
        writeJson(SESSION_KEY, sanitizeUser(user));
    }

    function clearSession() {
        window.localStorage.removeItem(SESSION_KEY);
    }

    function login(email, password) {
        const users = getUsers();
        const normalizedEmail = normalizeEmail(email);
        const user = users.find((item) => normalizeEmail(item.email) === normalizedEmail);

        if (!user || user.password !== password) {
            return { ok: false, error: "Invalid email or password." };
        }

        setSession(user);
        return { ok: true, user: sanitizeUser(user) };
    }

    function register(payloadOrName, email, password) {
        const payload = typeof payloadOrName === "object" && payloadOrName !== null
            ? payloadOrName
            : { firstName: payloadOrName, email, password, role: ROLE_PARTICIPANT };

        const firstName = normalizeText(payload.firstName);
        const lastName = normalizeText(payload.lastName);
        const username = normalizeUsername(payload.username);
        const normalizedEmail = normalizeEmail(payload.email);
        const normalizedRole = normalizeRole(payload.role);

        if (!firstName) {
            return { ok: false, error: "First name is required." };
        }

        if (!lastName) {
            return { ok: false, error: "Last name is required." };
        }

        if (!username) {
            return { ok: false, error: "Username is required." };
        }

        if (!normalizedEmail) {
            return { ok: false, error: "Email is required." };
        }

        if (!normalizedRole) {
            return { ok: false, error: "Role must be Participant or Tournament Admin." };
        }

        if (!password || password.length < 6) {
            return { ok: false, error: "Password must be at least 6 characters." };
        }

        const users = getUsers();
        const emailExists = users.some((user) => normalizeEmail(user.email) === normalizedEmail);
        if (emailExists) {
            return { ok: false, error: "This email is already registered." };
        }

        const usernameExists = users.some((user) => normalizeUsername(user.username) === username);
        if (usernameExists) {
            return { ok: false, error: "This username is already taken." };
        }

        const fullName = composeDisplayName(firstName, lastName);
        const newUser = {
            firstName,
            lastName,
            username,
            name: fullName,
            email: normalizedEmail,
            role: normalizedRole,
            password: password
        };
        users.push(newUser);
        saveUsers(users);
        setSession(newUser);
        return { ok: true, user: sanitizeUser(newUser) };
    }

    function logout() {
        clearSession();
    }

    function isAuthenticated() {
        return !!getSession();
    }

    function requireAuth() {
        if (isAuthenticated()) {
            return true;
        }

        const next = encodeURIComponent(window.location.pathname.split("/").pop() || "index.html");
        window.location.href = `login.html?next=${next}`;
        return false;
    }

    seedDefaultUser();

    window.fakeAuth = {
        login,
        register,
        logout,
        getSession,
        isAuthenticated,
        requireAuth,
        defaultCredentials: {
            email: DEFAULT_USER.email,
            password: DEFAULT_USER.password
        }
    };
})();
