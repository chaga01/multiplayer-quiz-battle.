# Quiz Battle — Real-Time Multiplayer Trivia

A responsive browser game for 2–12 players. Players create or join a room using a five-character code, then compete in an eight-question trivia match. The server synchronizes rooms, questions, timers, answers, and scores using Socket.IO.

## Rules
- 2–12 players per room.
- The host starts the game after at least two players have joined.
- Each match contains 8 randomly selected multiple-choice questions.
- Players have 15 seconds per question.
- Each player can submit one answer per question.
- A correct answer earns 500 points plus up to 500 speed-bonus points.
- Incorrect answers and unanswered questions earn 0 points.
- Highest total score after question 8 wins.

## Run locally
Requirements: Node.js 18 or newer.

```bash
npm install
npm start
```

Open http://localhost:3000 in your browser. To test multiplayer locally, open the URL in two different browsers or use one computer and a phone on the same network (use the computer's local IP for the phone).

## Publish it so friends can play remotely (Render)
1. Create a GitHub account if you do not already have one.
2. Create a new GitHub repository named `multiplayer-quiz-battle`.
3. Upload the files and folders from this project to the repository (keep `server.js`, `package.json`, `README.md`, and the `public` folder at the repository root).
4. Sign in to Render and choose **New → Web Service**.
5. Connect the GitHub repository.
6. Set **Build Command** to `npm install` and **Start Command** to `npm start`.
7. Choose a free or suitable instance according to Render's current plan options, then deploy.
8. Once the deploy finishes, open the public `onrender.com` URL shown in the service dashboard.
9. Share that URL with friends. One player creates a room and shares the five-character room code.

Render supplies the `PORT` environment variable automatically. No database or API key is needed for this demo; active rooms live in server memory, so rooms are cleared if the server restarts.

## Important notes
- This is a playable starter project, not a production-hardened service.
- Game rooms are stored in server memory. For persistent rooms or multi-instance scaling, use a shared store such as Redis.
- The host role transfers to another player if the host disconnects.
- Keep the game on one server instance for the initial deployment.
