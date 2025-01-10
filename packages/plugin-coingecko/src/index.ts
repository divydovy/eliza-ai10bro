import { Plugin } from "@elizaos/core";
import getMarkets from "./actions/getMarkets";
import getPrice from "./actions/getPrice";
import getTopGainersLosers from "./actions/getTopGainersLosers";
import getTrending from "./actions/getTrending";
import { categoriesProvider } from "./providers/categoriesProvider";

export const coingeckoPlugin: Plugin = {
    name: "coingecko",
    description: "CoinGecko Plugin for Eliza",
    actions: [getPrice, getTrending, getMarkets, getTopGainersLosers],
    evaluators: [],
    providers: [categoriesProvider],
};

export default coingeckoPlugin;
