# NestJS Starter Project

Dự án NestJS RESTful API starter tích hợp TypeORM, Database Migration, Swagger, i18n và Authentication (JWT + Bcrypt).

## 🚀 Công nghệ sử dụng
- **NestJS v12** (Node.js framework)
- **TypeORM & PostgreSQL**
- **Swagger (@nestjs/swagger)**: Tài liệu hóa API tại `/api`
- **nestjs-i18n**: Hỗ trợ đa ngôn ngữ (English `en`, Tiếng Việt `vi`)
- **Authentication**: JWT (Access Token & Refresh Token), Passport (`@nestjs/jwt`, `passport-jwt`)
- **Bcrypt**: Băm mật khẩu người dùng & Refresh Token
- **Class-validator / Class-transformer**: Validation DTO tự động

---

## 🛠️ Cài đặt & Chạy dự án

### 1. Cài đặt dependencies
```bash
npm install
```

### 2. Cấu hình biến môi trường
Tạo file `.env` từ `.env.example`:
```bash
cp .env.example .env
```
Cấu hình các thông số Database PostgreSQL (`DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`), `JWT_SECRET`, và `JWT_REFRESH_SECRET`.

### 3. Database Migrations thủ công (TypeORM)
Dự án đã cấu hình đầy đủ các lệnh migration thủ công:
- **Tạo migration mới**:
  ```bash
  npm run migration:create src/migrations/<MigrationName>
  ```
- **Tự động sinh migration từ Entity khác biệt**:
  ```bash
  npm run migration:generate src/migrations/<MigrationName>
  ```
- **Chạy các migrations chưa apply**:
  ```bash
  npm run migration:run
  ```
- **Revert (rollback) migration gần nhất**:
  ```bash
  npm run migration:revert
  ```
- **Xem trạng thái migrations**:
  ```bash
  npm run migration:show
  ```
- **Reset / Drop toàn bộ schema database**:
  ```bash
  npm run schema:drop
  ```

### 4. Chạy ứng dụng
```bash
# Development mode
npm run start:dev

# Production build
npm run build
npm run start:prod
```

---

## 📖 API Documentation (Swagger)
Sau khi khởi động ứng dụng, truy cập Swagger UI tại:
👉 `http://localhost:3000/api`

### Các Endpoints chính:
- **App**:
  - `GET /`: Hello World cơ bản.
  - `GET /hello-i18n?lang=vi` (hoặc `lang=en`): Trả về lời chào theo ngôn ngữ thông qua `nestjs-i18n`.
- **Auth (Register - Login - Logout)**:
  - `POST /auth/register`: Đăng ký tài khoản (hashing password với Bcrypt, sinh Access Token & Refresh Token).
  - `POST /auth/login`: Đăng nhập & nhận cặp Bearer JWT (Access Token + Refresh Token).
  - `POST /auth/logout`: Đăng xuất (yêu cầu Bearer Token), vô hiệu hóa Refresh Token trong database.
  - `GET /auth/profile`: Endpoint được bảo vệ bằng `JwtAuthGuard` (yêu cầu Header `Authorization: Bearer <token>`).
