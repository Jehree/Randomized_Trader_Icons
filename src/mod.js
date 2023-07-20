"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const config = __importStar(require("../config/config.json"));
class Mod {
    constructor() {
        this.modPath = path.normalize(path.join(__dirname, ".."));
        this.tempAvatarIconPath = path.join(os.tmpdir(), "Battlestate Games/EscapeFromTarkov/files/trader/avatar");
    }
    preAkiLoad(container) {
        const staticRouterModService = container.resolve("StaticRouterModService");
        staticRouterModService.registerStaticRouter("On_Raid_End_RandomTraderIcons", [{
                url: "/client/match/offline/end",
                action: (url, info, sessionId, output) => {
                    const databaseServer = container.resolve("DatabaseServer");
                    const dbTables = databaseServer.getTables();
                    const dbTraders = dbTables.traders;
                    for (const traderId in dbTraders) {
                        this.clearTraderIconCache();
                        const sysmemPath = `${this.modPath}/src/sysmem.json`;
                        const sysmem = JSON.parse(fs.readFileSync(sysmemPath, "utf8"));
                        const traderFolderName = this.getTraderFolderName(traderId);
                        const imagePackName = sysmem.active_icon_pack;
                        const traderFolderPath = `${this.modPath}/trader_images/${imagePackName}/${traderFolderName}`;
                        const activeTraderIconPath = `${traderFolderPath}/active_trader_icon.jpg`;
                        this.refreshActiveTraderIcon(activeTraderIconPath, traderFolderPath, imagePackName, traderFolderName);
                    }
                    return output;
                }
            }], "aki_RandomTraderIcons");
    }
    postAkiLoad(container) {
        const databaseServer = container.resolve("DatabaseServer");
        const dbTables = databaseServer.getTables();
        const dbTraders = dbTables.traders;
        const imageRouter = container.resolve("ImageRouter");
        const logger = container.resolve("WinstonLogger");
        const sysmemPath = `${this.modPath}/src/sysmem.json`;
        let imagePackName;
        if (config.random_icon_pack) {
            imagePackName = this.getRandomPack();
        }
        else {
            imagePackName = config.force_icon_pack;
        }
        //write imagePackName to sysmem file
        const sysmem = JSON.parse(fs.readFileSync(sysmemPath, "utf8"));
        sysmem.active_icon_pack = imagePackName;
        fs.writeFileSync(sysmemPath, JSON.stringify(sysmem, null, 4));
        //logging----
        logger.log(`--------------[RANDOM TRADER IMAGES]--------------`, "magenta");
        logger.log(`Random trader images from pack below loaded:`, "yellow");
        logger.log(`${imagePackName}!`, "green");
        if (!config.auto_clear_trader_icon_cache) {
            logger.log(`auto_clear_trader_icon_cache is disabled! Either enable it in the config,\nor manually clean your temp files to allow icons to update`, "yellow");
            logger.log(`To do so, click "Settins" and then "Clean Temp Files" in the SPT-AKI launcher`, "yellow");
        }
        logger.log(`--------------[RANDOM TRADER IMAGES]--------------`, "magenta");
        //logging----
        for (const traderId in dbTraders) {
            //for each trader in this loop, choose a random image from within their folder inside the randomly chosen pack
            const traderFolderName = this.getTraderFolderName(traderId);
            const traderFolderPath = `${this.modPath}/trader_images/${imagePackName}/${traderFolderName}`;
            const activeTraderIconPath = `${traderFolderPath}/active_trader_icon.jpg`;
            this.refreshActiveTraderIcon(activeTraderIconPath, traderFolderPath, imagePackName, traderFolderName);
            const imgRouteKey = `${dbTraders[traderId].base.avatar}`.slice(0, -4);
            if (fs.existsSync(activeTraderIconPath)) {
                imageRouter.addRoute(imgRouteKey, activeTraderIconPath);
            }
        }
        this.clearTraderIconCache();
    }
    getTraderFolderName(traderId) {
        const traderNamesById = {
            "5a7c2eca46aef81a7ca2145d": "mechanic",
            "58330581ace78e27b8b10cee": "skier",
            "5935c25fb3acc3127c3d8cd9": "peacekeeper",
            "54cb57776803fa99248b456e": "therapist",
            "54cb50c76803fa8b248b4571": "prapor",
            "5c0647fdd443bc2504c2d371": "jaeger",
            "5ac3b934156ae10c4430e83c": "ragman",
            "579dc571d53a0658a154fbec": "fence"
        };
        let traderFolderName = traderId;
        Object.entries(traderNamesById).forEach(([key, val]) => {
            if (key === traderId) {
                traderFolderName = val;
            }
        });
        return traderFolderName;
    }
    refreshActiveTraderIcon(activeTraderIconPath, traderFolderPath, imagePackName, traderFolderName) {
        if (fs.existsSync(activeTraderIconPath)) {
            fs.rmSync(activeTraderIconPath, { recursive: true });
        }
        const randomTraderImageName = this.getRandomTraderImage(imagePackName, traderFolderName);
        if (fs.existsSync(traderFolderPath)) {
            fs.copyFileSync(`${traderFolderPath}/${randomTraderImageName}`, activeTraderIconPath);
        }
    }
    getRandomPack() {
        const packNames = this.getArrOfFileNames(`${this.modPath}/trader_images`);
        for (let i = packNames.length - 1; i >= 0; i--) {
            if (packNames[i] === ".empty" || packNames[i] === ".disabled") {
                packNames.splice(i, 1);
            }
        }
        const random = Math.floor(Math.random() * packNames.length);
        return packNames[random];
    }
    getRandomTraderImage(imagePack, traderFolderName) {
        const traderFolderPath = `${this.modPath}/trader_images/${imagePack}/${traderFolderName}`;
        if (fs.existsSync(traderFolderPath)) {
            const traderImageNames = this.getArrOfFileNames(traderFolderPath);
            if (traderImageNames.length >= 1) {
                const random = Math.floor(Math.random() * traderImageNames.length);
                return traderImageNames[random];
            }
        }
    }
    getArrOfFileNames(folderPath) {
        const fileNames = [];
        fs.readdirSync(folderPath).forEach(file => {
            fileNames.push(file);
        });
        return fileNames;
    }
    clearTraderIconCache() {
        if (config.auto_clear_trader_icon_cache) {
            if (fs.existsSync(this.tempAvatarIconPath)) {
                fs.rmSync(this.tempAvatarIconPath, { recursive: true });
            }
        }
    }
}
module.exports = { mod: new Mod() };
