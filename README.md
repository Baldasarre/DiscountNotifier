# Overview

**DiscountNotifier** is a developer-friendly backend tool that simplifies user registration, email verification, and profile management for discount applications. Built with Express, it provides a scalable and secure architecture to handle user interactions and external service integrations seamlessly.

---

## 💡 Why DiscountNotifier?

This project aims to streamline backend processes for discount-related apps, ensuring secure and efficient user management. The core features include:

- 🛠️ **API Endpoints**: Facilitates user registration, login, and profile updates with a clean, organized API.

- 📧 **Email Communication**: Automates email verification and discount notifications to enhance user onboarding.

- 🔐 **Secure Data Handling**: Manages user data, verification codes, and preferences using best security practices.

- ⚙️ **Middleware & Dependencies**: Leverages Express and middleware for a scalable, maintainable backend architecture.

- 🌐 **External Service Integration**: Supports Gmail-based SMTP and cookie/session handling for seamless user experiences.

---

## 📦 Stack

- **Frontend**: HTML, CSS, JavaScript  
- **Backend**: Node.js + Express  
- **Email**: Nodemailer + Gmail SMTP  
- **Data Storage**: Local JSON (`users.json`)  
- **Session Management**: Cookie-based (with validation rules)

---

## 🛠️ Getting Started

```bash
git clone https://github.com/Baldasarre/DiscountNotifier.git
cd DiscountNotifier
npm install
```

Create a `.env` file in the root directory with your Gmail credentials:

```env
EMAIL_USER=youremail@gmail.com
EMAIL_PASS=your_app_password
```

> 💡 You must enable 2FA on your Google account and generate an App Password.

Then start the server:

```bash
node server.js
```

---

## 📂 Project Structure

```
📦 DiscountNotifier
 ┣ 📂 public
 ┃ ┣ 📄 index.html / user.html
 ┃ ┣ 📄 index.js / user.js
 ┃ ┣ 📄 index.css / user.css
 ┃ ┣ 📄 *.png (brand logos)
 ┣ 📄 server.js
 ┣ 📄 users.json (auto-created)
 ┣ 📄 .env (not included in Git)
 ┣ 📄 .gitignore
 ┗ 📄 README.md
```

---

## 👤 Author

**[@Baldasarre](https://github.com/Baldasarre)**  
Contact: yalcndeniz25@gmail.com

---

## 📄 License

MIT License
