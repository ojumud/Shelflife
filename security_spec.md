# Firestore Security Specification

## 1. Data Invariants
1. **Default-Deny Baseline**: Every unmapped path is explicitly denied (`allow read, write: if false;`).
2. **Private User Profile Isolation**: `/users/{userId}` is strictly readable and writable only by `request.auth.uid == userId`. No blanket `list` is allowed.
3. **Pantry Master Gate**: Access to `/pantries/{pantryId}/items`, `/shoppingList`, and `/history` requires an active membership document at `/pantries/{pantryId}/members/{request.auth.uid}` with role `'owner'` or `'member'`.
4. **Owner vs Member RBAC**:
   - **Owner**: Creator (`ownerId == request.auth.uid`) can update pantry name/inviteCode, remove any member, or delete the pantry.
   - **Member**: Can read pantry metadata, read/add/edit/delete items, shopping list entries, and waste history, or remove their own membership (leave pantry). Cannot delete the pantry or remove other members.
5. **Invite Code Integrity**: `/invites/{inviteCode}` forbids `list` queries (`allow list: if false`) so invite codes cannot be scraped. Joining a pantry as a `'member'` requires `joinedViaCode` to match the target pantry's live `inviteCode` (`get(.../pantries/$(pantryId)).data.inviteCode`).
6. **Immutable Ownership & Temporal Integrity**: `ownerId`, `createdBy`, `addedBy`, `recordedBy`, and `createdAt`/`joinedAt`/`recordedAt` are immutable after creation and validated against `request.auth.uid` and `request.time`.

## 2. Adversarial "Dirty Dozen" Payloads (All Expected: PERMISSION_DENIED)
1. **Unauthenticated Item Read**: `GET /pantries/p1/items/i1` with `auth: null`.
2. **Non-Member Pantry Item Read**: `GET /pantries/p1/items/i1` as `uid: "intruder"` without `/pantries/p1/members/intruder`.
3. **Blanket Pantry Listing**: `LIST /pantries` by any user (must fail; pantries are resolved via `users/{uid}` or `invites/{code}`).
4. **Blanket Invite Scraping**: `LIST /invites` by any user (`allow list: if false`).
5. **Self-Promote to Owner on Join**: `CREATE /pantries/p1/members/intruder` with `{ role: "owner", joinedViaCode: "123456" }`.
6. **Join With Wrong Invite Code**: `CREATE /pantries/p1/members/intruder` with `{ role: "member", joinedViaCode: "000000" }` when pantry code is `"482910"`.
7. **Member Deleting Another Member**: `DELETE /pantries/p1/members/victim` by a user whose role is `"member"`.
8. **Member Deleting Pantry**: `DELETE /pantries/p1` by a user whose role is `"member"`.
9. **Shadow Field Injection on Item**: `CREATE /pantries/p1/items/i2` with extra ghost field `isAdmin: true`.
10. **Identity Spoofing on Item**: `CREATE /pantries/p1/items/i2` with `createdBy: "someoneElse"` != `request.auth.uid`.
11. **Oversized ID Poisoning**: `CREATE /pantries/p1/items/aaaa...` (150 chars or invalid characters like `$`).
12. **Client-Forged Timestamp**: `CREATE /pantries/p1/items/i2` with `createdAt` set to a past client timestamp instead of `request.time`.
