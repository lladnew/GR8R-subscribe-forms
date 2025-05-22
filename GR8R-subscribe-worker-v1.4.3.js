// Cloudflare Worker: Airtable Proxy v1.4.3

// Changelog:
// - Trusts frontend to include correct tags (e.g., "Newsletter, Pivot Year")
// - Converts Campaign Interest to multi-select array for Airtable
// - Skips empty fields when patching
// - Preserves Subscribed Date, Source, and Status for updates
// - Includes status signal: { status: "created" | "updated" }

export default {
  async fetch(request, env, ctx) {
    const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID, AIRTABLE_TABLE_ID } = env;

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    try {
      const body = await request.json();
      const {
        firstName, lastName, emailAddress, phoneNumber,
        deliveryPreference, campaignInterest, source
      } = body;

      const headers = {
        Authorization: `Bearer ${AIRTABLE_TOKEN}`,
        "Content-Type": "application/json"
      };

      const searchUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?filterByFormula={Email}='${emailAddress}'`;
      const searchRes = await fetch(searchUrl, { headers });
      const searchData = await searchRes.json();
      console.log("Search result:", JSON.stringify(searchData, null, 2));

      const now = new Date().toISOString();
      const tags = campaignInterest?.split(",").map(tag => tag.trim()).filter(Boolean) || [];
      const normalizedPref = ["Both", "Email", "Text"].includes(deliveryPreference) ? deliveryPreference : undefined;

      const baseFields = {
        "First Name": firstName,
        "Last Name": lastName,
        "Email": emailAddress,
        "Phone number": phoneNumber,
        "Delivery Preference": normalizedPref,
        "Campaign Interest": tags
      };

      if (!searchData.records || searchData.records.length === 0) {
        // New record
        const fields = {
          ...baseFields,
          "Subscribed Date": now,
          "Source": source || "Direct",
          "Status": "Pending"
        };

        const createRes = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}`, {
          method: "POST",
          headers,
          body: JSON.stringify({ fields })
        });

        const createResult = await createRes.json();
        console.log("Create result:", JSON.stringify(createResult, null, 2));
        return new Response(JSON.stringify({ status: "created" }), {
          status: 200,
          headers: { "Access-Control-Allow-Origin": "*" }
        });
      } else {
        // Update existing record
        const record = searchData.records[0];
        const patchFields = {};

        for (const [key, value] of Object.entries(baseFields)) {
          if (value !== undefined && value !== "") {
            patchFields[key] = value;
          }
        }

        console.log("Updating record:", record.id);
        console.log("Patch payload:", JSON.stringify(patchFields, null, 2));

        const patchRes = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}/${record.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ fields: patchFields })
        });

        const patchResult = await patchRes.json();
        console.log("Patch result:", JSON.stringify(patchResult, null, 2));

        return new Response(JSON.stringify({ status: "updated" }), {
          status: 200,
          headers: { "Access-Control-Allow-Origin": "*" }
        });
      }
    } catch (error) {
      console.error("Error processing request:", error);
      return new Response("Internal Server Error", {
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" }
      });
    }
  }
};
