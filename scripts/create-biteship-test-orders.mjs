import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.trim().startsWith("#"))
    .map((line) => {
      const index = line.indexOf("=");
      const key = line.slice(0, index);
      let value = line.slice(index + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      return [key, value];
    })
);

const apiKey = env.BITESHIP_API_KEY;
if (!apiKey) {
  console.error("BITESHIP_API_KEY missing from .env.local");
  process.exit(1);
}

const originPostal = Number(env.BITESHIP_ORIGIN_POSTAL_CODE);
const originAddress = env.BITESHIP_ORIGIN_ADDRESS;
const shipperName = env.BITESHIP_SHIPPER_NAME || "Aeris Beaute";
const shipperPhone = (env.BITESHIP_SHIPPER_PHONE || "")
  .replace(/\D/g, "")
  .replace(/^62/, "0");

async function createOrder(label, destinationPostal, destinationAddress) {
  const payload = {
    shipper_contact_name: shipperName,
    shipper_contact_phone: shipperPhone,
    origin_contact_name: shipperName,
    origin_contact_phone: shipperPhone,
    origin_postal_code: originPostal,
    origin_address: originAddress,
    destination_contact_name: `Test Recipient ${label}`,
    destination_contact_phone: "08123456789",
    destination_postal_code: destinationPostal,
    destination_address: destinationAddress,
    destination_note: `Biteship sandbox test order ${label}`,
    courier_company: "anteraja",
    courier_type: "reg",
    delivery_type: "now",
    reference_id: `AERIS-TEST-${label}-${Date.now()}`,
    order_note: `Sandbox test for API activation (${label})`,
    metadata: { source: "aeris-activation-test" },
    items: [
      {
        name: "Test marketing goods",
        description: "Sandbox activation test",
        category: "others",
        value: 100000,
        quantity: 1,
        length: 25,
        width: 20,
        height: 15,
        weight: 500,
      },
    ],
  };

  const response = await fetch("https://api.biteship.com/v1/orders", {
    method: "POST",
    headers: {
      authorization: apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, body };
}

const destinations = [
  ["DELIVERED", { postal: 13410, address: "Jl. Raya Bekasi KM 19, Jakarta Timur" }],
  ["CANCELLED", { postal: 12950, address: "Lebak Bulus, Jakarta Selatan" }],
];

const created = [];

for (const [label, destination] of destinations) {
  const result = await createOrder(label, destination.postal, destination.address);
  console.log(`\n=== ${label} test order ===`);
  console.log(`HTTP ${result.status}`);

  if (result.ok && result.body.id) {
    console.log(`Order ID: ${result.body.id}`);
    console.log(`Status: ${result.body.status ?? "confirmed"}`);
    created.push({ label, id: result.body.id });
  } else {
    console.log("Failed:", JSON.stringify(result.body, null, 2));
  }
}

if (created.length === 2) {
  console.log("\n--- Next steps in Biteship dashboard ---");
  console.log("1. Open Pengiriman (Shipments) with Testing Mode ON");
  console.log(`2. Find order ${created[0].id} → Update Status → DELIVERED`);
  console.log(`3. Find order ${created[1].id} → Update Status → CANCEL`);
  console.log("4. Submit both IDs on the API activation form");
}
