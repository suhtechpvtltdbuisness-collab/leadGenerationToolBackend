// Lead schema validation for MongoDB native driver
const leadSchema = {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["name"],
      properties: {
        name: {
          bsonType: "string",
          description: "Name is required",
        },
        serialNumber: {
          bsonType: ["int", "long", "null"],
          description: "Serial number or index of the lead",
        },
        rating: {
          bsonType: ["string", "null"],
          description: "Rating of the lead",
        },
        address: {
          bsonType: ["string", "null"],
          description: "Address of the lead",
        },
        phoneNumber: {
          bsonType: ["string", "null"],
          description: "Phone number of the lead",
        },
        email: {
          bsonType: ["string", "null"],
          description: "Email of the lead",
        },
        websiteLink: {
          bsonType: ["string", "null"],
          description: "Website link of the lead",
        },
        googleLink: {
          bsonType: ["string", "null"],
          description: "Google Maps link of the lead",
        },
        createdAt: {
          bsonType: "date",
          description: "Timestamp when the lead was created",
        },
        updatedAt: {
          bsonType: "date",
          description: "Timestamp when the lead was last updated",
        },
      },
    },
  },
};

// Helper function to validate lead data before insertion
const validateLead = (leadData) => {
  if (
    !leadData.name ||
    typeof leadData.name !== "string" ||
    leadData.name.trim() === ""
  ) {
    throw new Error("Name is required and must be a non-empty string");
  }

  return {
    name: leadData.name.trim(),
    serialNumber:
      leadData.serialNumber || leadData.srNo || leadData.index || null,
    rating: leadData.rating || null,
    address: leadData.address || null,
    phoneNumber: leadData.phoneNumber || leadData.phone || null,
    email: leadData.email || null,
    websiteLink: leadData.websiteLink || leadData.website || null,
    googleLink: leadData.googleLink || leadData.mapsLink || null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
};


module.exports = { leadSchema, validateLead };

