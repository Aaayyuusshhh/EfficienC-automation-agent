export function formatProfessionalEmail({ person, message, meetLink, time }) {
    const name = person
        ? person.charAt(0).toUpperCase() + person.slice(1)
        : "there";

    // Detect tone of message
    const lowerMsg = message.toLowerCase();

    let closingLine = "";

    if (lowerMsg.includes("review") || lowerMsg.includes("update")) {
        closingLine = "Please come prepared with the necessary updates.";
    } else if (lowerMsg.includes("join") || lowerMsg.includes("meeting")) {
        closingLine = "Please ensure you're available and on time.";
    } else if (lowerMsg.includes("hope") || lowerMsg.includes("feeling")) {
        closingLine = ""; // no extra pressure line
    } else if (lowerMsg.includes("asap") || lowerMsg.includes("urgent")) {
        closingLine = "Please prioritize this and share an update at the earliest.";
    } else {
        closingLine = "Let me know if anything is needed from my end.";
    }

    return `
Hi ${name},

${message}

${meetLink ? `
──────────
📅 Meeting Details

🔗 Join Link:
${meetLink}
${time ? `⏰ Time: ${time}` : ""}

──────────` : ""}

${closingLine}

Best regards,  
Aayush
`.trim();
}