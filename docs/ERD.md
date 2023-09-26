# ERD — MEDIBOOK CLINIC

```mermaid
erDiagram
    SPECIALTIES ||--o{ DOCTORS : "co"
    DOCTORS ||--o{ DOCTOR_SCHEDULES : "lich tuan"
    DOCTORS ||--o{ DOCTOR_TIME_OFF : "ngay nghi"
    DOCTORS ||--o{ APPOINTMENTS : "kham"
    USERS ||--o{ APPOINTMENTS : "dat"
    USERS ||--o| DOCTORS : "tai khoan bac si"
    USERS ||--o{ SLOT_HOLDS : "giu slot"
    DOCTORS ||--o{ SLOT_HOLDS : "slot"
    USERS ||--o{ NOTIFICATIONS : "nhan"

    SPECIALTIES { int id PK; string name UK; string description }
    DOCTORS { int id PK; string full_name; int specialty_id FK; string title; int consultation_fee; int slot_minutes; int years_experience; string room }
    USERS { int id PK; string email UK; string password_hash; string role; string full_name; string phone; int doctor_id FK; bool is_active }
    DOCTOR_SCHEDULES { int id PK; int doctor_id FK; int weekday; string start_time; string end_time }
    DOCTOR_TIME_OFF { int id PK; int doctor_id FK; string date; string reason }
    APPOINTMENTS { int id PK; int patient_id FK; int doctor_id FK; string slot_start; string slot_end; string reason; string status; string clinical_notes; string instructions }
    SLOT_HOLDS { int id PK; int doctor_id FK; string slot_start; int patient_id FK; string expires_at }
    NOTIFICATIONS { int id PK; int user_id FK; string type; string title; string body; bool is_read }
```

Ghi chú: ràng buộc nghiệp vụ quan trọng nhất — UNIQUE(doctor_id, slot_start) trên các lịch chưa hủy của `appointments` và trên `slot_holds` — xem `docs/ARCHITECTURE.md`.
