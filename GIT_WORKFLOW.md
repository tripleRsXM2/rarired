# CourtSync Git Workflow
### 2-Person Team: Mikey & Mdawg

---

## Core Rules

1. **Never push directly to `main`**
2. **Always pull latest `main` before starting anything**
3. **One branch per feature or fix**
4. **Let the other person know before merging into main**
5. **If you're both touching the same file — talk first**

---

## Branch Naming

```
Mikey/dm-system
Mikey/friends-panel
Mikey/score-modal-fix

Mdawg/profile-ui
Mdawg/leaderboard-bug
Mdawg/auth-cleanup
```

Format: `YourName/short-description` — lowercase, hyphens, no spaces.

---

## Daily Workflow

### 1. Start new work

```bash
git checkout main
git pull origin main
git checkout -b Mikey/dm-system
```

### 2. Do your work, then commit

```bash
git add .
git commit -m "Add DM thread UI"
```

### 3. Before pushing — sync with latest main

```bash
git checkout main
git pull origin main
git checkout Mikey/dm-system
git merge main
```

Resolve any conflicts (see below), then:

```bash
git push origin Mikey/dm-system
```

### 4. Merge into main (after other person knows)

```bash
git checkout main
git pull origin main
git merge Mikey/dm-system
git push origin main
```

---

## What Happens If Both Push At Once

- **First push:** goes through fine
- **Second push:** gets rejected — GitHub says your branch is behind

**Fix:**
```bash
git pull origin main        # pull latest
git merge main              # merge into your branch
# resolve conflicts if any
git push origin Mdawg/profile-ui
```

Simple rule: whoever pushes second has to sync first.

---

## Merge Conflict Mini-Guide

You'll see this in a file when there's a conflict:

```
<<<<<<< HEAD
your version of the code
=======
their version of the code
>>>>>>> main
```

**Steps:**
1. Open the file, pick what stays (yours, theirs, or a combo)
2. Delete the conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`)
3. Save the file
4. Run the app — make sure it still works
5. Then:

```bash
git add .
git commit -m "Resolve merge conflict in ScoreModal"
git push origin Mikey/friends-panel
```

---

## Best Practices for 2 People

| Situation | What to do |
|-----------|-----------|
| Big new feature | Open a PR so the other person can review |
| Small bug fix | Branch + push + quick message is fine |
| Both touching same component | Talk first, coordinate who goes first |
| Unsure if main is stable | Ask before merging |

---

## Full Copy-Paste Reference

**Mikey starting work:**
```bash
git checkout main
git pull origin main
git checkout -b Mikey/dm-system
# work...
git add .
git commit -m "Add DM thread UI"
git checkout main
git pull origin main
git checkout Mikey/dm-system
git merge main
git push origin Mikey/dm-system
```

**Mdawg starting work:**
```bash
git checkout main
git pull origin main
git checkout -b Mdawg/profile-ui
# work...
git add .
git commit -m "Redesign profile header"
git checkout main
git pull origin main
git checkout Mdawg/profile-ui
git merge main
git push origin Mdawg/profile-ui
```

---

## Golden Rules

```
Pull before work.
Branch before coding.
Sync before push.
Never raw dog main.
```
