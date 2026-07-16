const { PDFDocument } = require("pdf-lib");
const { renderTicketPng } = require("../shared/ticketPdfArtwork");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: { Allow: "POST" }, body: "Method not allowed" };
  }

  try {
    const input = JSON.parse(event.body || "{}");
    const required = ["eventName", "ticketType", "date", "time", "ticketRef", "qrCodeDataUrl"];
    const missing = required.filter((key) => !input[key]);
    if (missing.length) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing ticket fields", missing }) };
    }

    const artwork = await renderTicketPng(input);
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([artwork.width, artwork.height]);
    const image = await pdf.embedPng(artwork.bytes);
    page.drawImage(image, { x: 0, y: 0, width: artwork.width, height: artwork.height });
    const bytes = await pdf.save();

    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="ticket-${String(input.ticketRef).replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf"`,
        "Cache-Control": "no-store",
      },
      body: Buffer.from(bytes).toString("base64"),
    };
  } catch (error) {
    console.error("download-ticket-pdf: generation failed", error);
    return { statusCode: 500, body: JSON.stringify({ error: "Unable to generate ticket PDF" }) };
  }
};
