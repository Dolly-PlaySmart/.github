# Play Smart — Engineering


Play Smart is a play-to-earn Android app. Users earn virtual coins by playing
casual Unity games. Coins convert to USD automatically and are withdrawable
via a PSP after KYC verification.


---


## Architecture


Three independent components:

```
  [ playsmart-app ]  --SDK-->  [ playsmart-sdk ]  --HTTP-->  [ playsmart-api ]
   Unity launcher              C# tracking lib               Bun + TypeScript
        |                                                           |
        +-- launches --> [ playsmart-{gamename} ]                [ CMS ]
                          Unity child games
```


playsmart-extension-sdk provides reusable Unity UI and components (bootscene, popups)
imported by both playsmart-app and child games.


---


## Repos


| Repo | Role | Stack |
|------|------|-------|
| [playsmart-app](https://github.com/Dolly-PlaySmart/playsmart-app) | Unity parent app (launcher) | Unity / C# |
| [playsmart-api](https://github.com/Dolly-PlaySmart/playsmart-api) | Backend API | Bun / TypeScript |
| [playsmart-sdk](https://github.com/Dolly-PlaySmart/playsmart-sdk) | C# tracking SDK | C# |
| [playsmart-extension-sdk](https://github.com/Dolly-PlaySmart/playsmart-extension-sdk) | Unity UI kit | Unity / C# |
| [playsmart-game-template](https://github.com/Dolly-PlaySmart/playsmart-game-template) | Unity game template for creating new Play Smart mobile titles. | Unity / C# |
| [playsmart-riddle-rails](https://github.com/Dolly-PlaySmart/playsmart-riddle-rails) | Child game — Riddle Rails | Unity / C# |
| [playsmart-knife-king](https://github.com/Dolly-PlaySmart/playsmart-knife-king) | Child game — Knife King | Unity / C# |
| [playsmart-mahjong-mania](https://github.com/Dolly-PlaySmart/playsmart-mahjong-mania) | Child game — Mahjong Mania | Unity / C# |
| playsmart-{gamename} | Future child games (one repo per game) | Unity / C# |


---


## Getting started


**Unity dev (parent app / games)**
Start with playsmart-app README, then playsmart-extension-sdk.
Adding a new game? Use the dolly-starter-unity template + GitBook guide.


**Backend dev**
Start with playsmart-api README.


**New to the project?**
Read the GitBook first (architecture + onboarding), then the repo READMEs.


---


## Documentation


📖 [Play Smart GitBook](https://app.gitbook.com/o/0UAIVIFxd9k5njYkK5ZJ/s/Kzr1uYpJ9HqZ6hUT9miW/) — architecture, integration guides, onboarding


---


## Team


| Name | Role | GitHub |
|------|------|--------|
| Martin | Senior Unity dev — Platform & games | @martiin3d |
| Tom | Unity dev — Platform & games | @Tomerzz |
| David | Unity/games dev | @dav-dev |
| Ayrton | Backend dev — API & SDK | @Simerca |
| Ciprian | Senior dev | @c1pr1an |
| Kev | Product Owner | @NabotKevin |


---


## Standards


- Naming: playsmart-{role} — lowercase, kebab-case. No exceptions.
- Every repo has a README, a CLAUDE.md, and a CODEOWNERS file.
- Branch protection on main. PRs require 1 review from CODEOWNERS.
- Full conventions: see CONTRIBUTING.md
