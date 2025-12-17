-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "googleId" TEXT,
    "phone" TEXT,
    "photoPath" TEXT,
    "role" TEXT NOT NULL DEFAULT 'CUSTOMER',
    "disabledAt" DATETIME,
    "disabledReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("createdAt", "disabledAt", "disabledReason", "email", "id", "name", "passwordHash", "phone", "photoPath", "role", "updatedAt") SELECT "createdAt", "disabledAt", "disabledReason", "email", "id", "name", "passwordHash", "phone", "photoPath", "role", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
CREATE INDEX "User_role_idx" ON "User"("role");
CREATE INDEX "User_disabledAt_idx" ON "User"("disabledAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
