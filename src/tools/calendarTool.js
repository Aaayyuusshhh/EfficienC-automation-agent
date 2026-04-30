import fs from "fs";
import readline from "readline";
import path from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCOPES = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/gmail.send"
];

const CREDENTIALS_PATH = path.join(__dirname, "../../credentials.json");
const TOKEN_PATH = path.join(__dirname, "../../token.json");

function authorize() {
    const content = fs.readFileSync(CREDENTIALS_PATH);
    const credentials = JSON.parse(content);

    const { client_secret, client_id, redirect_uris } =
        credentials.installed;

    const oAuth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris[0]
    );

    if (fs.existsSync(TOKEN_PATH)) {
        const token = fs.readFileSync(TOKEN_PATH);
        oAuth2Client.setCredentials(JSON.parse(token));
        return Promise.resolve(oAuth2Client);
    }

    return getNewToken(oAuth2Client);
}

function getNewToken(oAuth2Client) {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: "offline",
        scope: SCOPES
    });

    console.log("\n👉 Open this URL in browser:\n", authUrl);

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve, reject) => {
        rl.question("\nPaste the code here: ", (code) => {
            rl.close();

            oAuth2Client.getToken(code, (err, token) => {
                if (err) return reject(err);

                oAuth2Client.setCredentials(token);
                fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));

                console.log("✅ Token stored.");

                resolve(oAuth2Client);
            });
        });
    });
}

export async function createCalendarEvent({ title, datetime, attendees, description }) {
    // Validate attendees — Google silently skips invite email if this is wrong
    if (!attendees || attendees.length === 0) {
        throw new Error("Cannot create calendar event: attendees list is empty");
    }
    const validAttendees = attendees.filter(e => e && e.includes("@"));
    if (validAttendees.length === 0) {
        throw new Error(
            `Cannot create calendar event: no valid email found in attendees: ${JSON.stringify(attendees)}`
        );
    }

    console.log("📧 Attendees confirmed:", validAttendees);

    const auth = await authorize();
    const calendar = google.calendar({ version: "v3", auth });

    // End time = start + 1 hour (not Date.now() + 1 hour, which breaks future events)
    const startTime = new Date(datetime || new Date().toISOString());
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);

    const event = {
        summary: title,
        description: description || "",
        start: {
            dateTime: startTime.toISOString(),
            timeZone: "Asia/Kolkata"
        },
        end: {
            dateTime: endTime.toISOString(),
            timeZone: "Asia/Kolkata"
        },
        attendees: validAttendees.map(email => ({ email })),
        conferenceData: {
            createRequest: {
                requestId: "meet-" + Date.now(),
                conferenceSolutionKey: { type: "hangoutsMeet" }
            }
        }
    };

    console.log("📅 Sending calendar event:", {
        title: event.summary,
        start: event.start.dateTime,
        end: event.end.dateTime,
        attendees: validAttendees
    });

    const res = await calendar.events.insert({
        calendarId: "primary",
        resource: event,
        conferenceDataVersion: 1,
        sendUpdates: "all"
    });

    console.log("✅ Calendar API response:", {
        eventId: res.data.id,
        status: res.data.status,
        attendees: res.data.attendees?.map(a => ({ email: a.email, status: a.responseStatus })),
        meetLink: res.data.hangoutLink
    });

    return {
        eventId: res.data.id,
        meetLink: res.data.hangoutLink
    };
}