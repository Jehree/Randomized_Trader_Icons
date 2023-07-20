/* eslint-disable @typescript-eslint/quotes */
/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/brace-style */
import { DependencyContainer } from "tsyringe";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { IPostAkiLoadMod } from "@spt-aki/models/external/IPostAkiLoadMod";
import type { IPreAkiLoadMod } from "@spt-aki/models/external/IPreAkiLoadMod";
import type {StaticRouterModService} from "@spt-aki/services/mod/staticRouter/StaticRouterModService";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import {ImageRouter}  from "@spt-aki/routers/ImageRouter";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import * as config from "../config/config.json";

class Mod implements IPostAkiLoadMod, IPreAkiLoadMod
{

    modPath: string = path.normalize(path.join(__dirname, ".."))
    tempAvatarIconPath: string = path.join(os.tmpdir(), "Battlestate Games/EscapeFromTarkov/files/trader/avatar")
    container: DependencyContainer

    public preAkiLoad(container: DependencyContainer): void {

        const staticRouterModService = container.resolve<StaticRouterModService>("StaticRouterModService")

        staticRouterModService.registerStaticRouter(
            "On_Raid_End_RandomTraderIcons",
            [{
                url: "/client/match/offline/end",
                action: (url, info, sessionId, output) => {
                    const databaseServer = container.resolve<DatabaseServer>("DatabaseServer")
                    const dbTables = databaseServer.getTables()
                    const dbTraders = dbTables.traders

                    for (const traderId in dbTraders){

                        this.clearTraderIconCache()

                        const sysmemPath = `${this.modPath}/src/sysmem.json`
                        const sysmem = JSON.parse(fs.readFileSync(sysmemPath, "utf8"))

                        const traderFolderName = this.getTraderFolderName(traderId)
                        const imagePackName = sysmem.active_icon_pack

                        const traderFolderPath = `${this.modPath}/trader_images/${imagePackName}/${traderFolderName}`
                        const activeTraderIconPath = `${traderFolderPath}/active_trader_icon.jpg`
                        
                        this.refreshActiveTraderIcon(activeTraderIconPath, traderFolderPath, imagePackName, traderFolderName)
                    }

                    return output
                }
            }],
            "aki_RandomTraderIcons"
        );
    }

    public postAkiLoad(container: DependencyContainer): void {
        const databaseServer = container.resolve<DatabaseServer>("DatabaseServer")
        const dbTables = databaseServer.getTables()
        const dbTraders = dbTables.traders
        const imageRouter = container.resolve<ImageRouter>("ImageRouter")
        const logger = container.resolve<ILogger>("WinstonLogger")
        const sysmemPath = `${this.modPath}/src/sysmem.json`

        let imagePackName:string
        if (config.random_icon_pack){imagePackName = this.getRandomPack()
        } else {imagePackName = config.force_icon_pack}

        //write imagePackName to sysmem file
        const sysmem = JSON.parse(fs.readFileSync(sysmemPath, "utf8"))
        sysmem.active_icon_pack = imagePackName
        fs.writeFileSync(sysmemPath, JSON.stringify(sysmem, null, 4))

        //logging----
        logger.log(`--------------[RANDOM TRADER IMAGES]--------------`, "magenta")
        logger.log(`Random trader images from pack below loaded:`, "yellow")
        logger.log(`${imagePackName}!`, "green")
        if (!config.auto_clear_trader_icon_cache){
            logger.log(`auto_clear_trader_icon_cache is disabled! Either enable it in the config,\nor manually clean your temp files to allow icons to update`, "yellow")
            logger.log(`To do so, click "Settins" and then "Clean Temp Files" in the SPT-AKI launcher`, "yellow")
        }
        logger.log(`--------------[RANDOM TRADER IMAGES]--------------`, "magenta")
        //logging----

        for (const traderId in dbTraders){

            //for each trader in this loop, choose a random image from within their folder inside the randomly chosen pack
            const traderFolderName = this.getTraderFolderName(traderId)

            const traderFolderPath = `${this.modPath}/trader_images/${imagePackName}/${traderFolderName}`
            const activeTraderIconPath = `${traderFolderPath}/active_trader_icon.jpg`

            this.refreshActiveTraderIcon(activeTraderIconPath, traderFolderPath, imagePackName, traderFolderName)

            const imgRouteKey = `${dbTraders[traderId].base.avatar}`.slice(0,-4)

            if (fs.existsSync(activeTraderIconPath)){
                imageRouter.addRoute(imgRouteKey, activeTraderIconPath)
            }
        }

        this.clearTraderIconCache()
    }

    getTraderFolderName(traderId){
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

        let traderFolderName = traderId
        Object.entries(traderNamesById).forEach(([key, val]) => {
            if (key === traderId){
                traderFolderName = val;
            }
        });
        return traderFolderName
    }

    refreshActiveTraderIcon(activeTraderIconPath, traderFolderPath, imagePackName, traderFolderName){

        if (fs.existsSync(activeTraderIconPath)){
            fs.rmSync(activeTraderIconPath, {recursive: true})
        }

        const randomTraderImageName = this.getRandomTraderImage(imagePackName, traderFolderName)

        if (fs.existsSync(traderFolderPath)){
            fs.copyFileSync(`${traderFolderPath}/${randomTraderImageName}`, activeTraderIconPath)
        }
    }

    getRandomPack():string{
        const packNames = this.getArrOfFileNames(`${this.modPath}/trader_images`)

        for (let i = packNames.length-1; i >= 0; i--){
            if (packNames[i] === ".empty" || packNames[i] === ".disabled"){
                packNames.splice(i, 1)
            }
        }

        const random = Math.floor(Math.random() * packNames.length)
        return packNames[random]
    }

    getRandomTraderImage(imagePack:string, traderFolderName:string):string{

        const traderFolderPath = `${this.modPath}/trader_images/${imagePack}/${traderFolderName}`

        if (fs.existsSync(traderFolderPath)){

            const traderImageNames = this.getArrOfFileNames(traderFolderPath)

            if (traderImageNames.length >= 1){

                const random = Math.floor(Math.random() * traderImageNames.length)
                return traderImageNames[random]
            }
        }
    }

    getArrOfFileNames(folderPath:string):Array<string>{

        const fileNames:Array<string> = []  

        fs.readdirSync(folderPath).forEach(file => {

            fileNames.push(file)
        });
        return fileNames;
    }

    clearTraderIconCache(){
        if (config.auto_clear_trader_icon_cache){
            if (fs.existsSync(this.tempAvatarIconPath)){
                fs.rmSync(this.tempAvatarIconPath, {recursive: true})
            }
        }
    }
}

module.exports = { mod: new Mod() }