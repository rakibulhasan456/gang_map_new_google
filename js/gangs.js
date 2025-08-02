// gangs.js
var gangs = [
    {
        name: "Cali Cartel",
        color: "7F00FF",
        description: "Mexican drug cartel operating in Los Santos"
    },
    {
        name: "Lost MC",
        color: "FF0000",
        description: "Outlaw motorcycle club"
    },
    {
        name: "Vagos",
        color: "FFFF00",
        description: "Mexican street gang"
    },
    {
        name: "Ballas",
        color: "9400D3",
        description: "Purple gang from Davis"
    },
    {
        name: "Families",
        color: "00FF00",
        description: "Green gang from Chamberlain Hills"
    },
    {
        name: "Marabunta",
        color: "FFA500",
        description: "Central American gang"
    },
    {
        name: "Aztecas",
        color: "0000FF",
        description: "Blue gang from Rancho"
    },
    {
        name: "Neutral",
        color: "FFFFFF",
        description: "Unowned territory"
    }
    // Add more gangs as needed
];

function getGangByName(name) {
    return gangs.find(gang => gang.name === name);
}

function getGangByColor(color) {
    return gangs.find(gang => gang.color === color);
}