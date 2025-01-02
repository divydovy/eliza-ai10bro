import { transferTemplate } from "../templates";
import { Asset, CosmosTransferParams, Transaction } from "../types";
import { PaidFee } from "../services/paid-fee";
import { FeeEstimator } from "../services/fee-estimator";
import { getNativeAssetByChainName } from "@chain-registry/utils";
import { assets } from "chain-registry";
import {
    CosmosWalletChainsData,
    CosmosWalletProvider,
} from "../providers/wallet.ts";
import {
    composeContext,
    generateObjectDeprecated,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    ModelClass,
    State,
} from "@ai16z/eliza";
import BigNumber from "bignumber.js";
import { AssetList } from "@chain-registry/types";
import { Coin } from "@cosmjs/stargate";

export class TransferAction {
    constructor(private cosmosChainsData: CosmosWalletChainsData) {
        this.cosmosChainsData = cosmosChainsData;
    }

    async transfer(params: CosmosTransferParams): Promise<Transaction> {
        const signingCosmWasmClient =
            this.cosmosChainsData.getSigningCosmWasmClient(params.fromChain);

        const senderAddress = await this.cosmosChainsData.getWalletAddress(
            params.fromChain
        );

        if (!senderAddress) {
            throw new Error("No sender address");
        }

        if (!params.toAddress) {
            throw new Error("No receiver address");
        }

        const chainAssets: AssetList = this.cosmosChainsData.getAssetsList(
            params.fromChain
        );

        const assetToTransfer = params.denomOrIbc
            ? chainAssets.assets.find(
                  (asset) =>
                      asset.display === params.denomOrIbc ||
                      asset.ibc?.source_denom === params.denomOrIbc ||
                      asset.base === params.denomOrIbc ||
                      asset.symbol === params.denomOrIbc
              )
            : getNativeAssetByChainName(assets, params.fromChain);

        if (!assetToTransfer) {
            throw new Error(`Asset not found for denom: ${params.denomOrIbc}`);
        }

        const coin: Coin = {
            denom: assetToTransfer.base,
            amount: this.toBaseDenomAmount(params.amount, assetToTransfer),
        };

        const feeEstimator = new FeeEstimator(signingCosmWasmClient);
        const fee = await feeEstimator.estimateGasForSendTokens(
            senderAddress,
            params.toAddress,
            [coin]
        );

        const safeFee = Math.ceil(fee * 1.2).toString();

        const txDeliveryResponse = await signingCosmWasmClient.sendTokens(
            senderAddress,
            params.toAddress,
            [coin],
            { gas: safeFee, amount: [{ ...coin, amount: safeFee }] }
        );

        const gasPaidInUOM =
            PaidFee.getInstanceWithDefaultEvents().getPaidFeeFromReceipt(
                txDeliveryResponse
            );

        return {
            from: senderAddress,
            to: params.toAddress,
            gasPaidInUOM,
            txHash: txDeliveryResponse.transactionHash,
        };
    }

    private toBaseDenomAmount(amount: string, asset: Asset): string {
        const displayDenomUnit = asset.denom_units.find(
            (unit) => unit.denom === asset.display
        );
        if (!displayDenomUnit) {
            throw new Error(
                `Display unit not found for asset: ${asset.display}`
            );
        }
        return new BigNumber(amount)
            .multipliedBy(10 ** displayDenomUnit.exponent)
            .decimalPlaces(0, BigNumber.ROUND_DOWN)
            .toString();
    }
}

export const transferAction = {
    name: "COSMOS_TRANSFER",
    description: "Transfer tokens between addresses on the same chain",
    handler: async (
        _runtime: IAgentRuntime,
        _message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        _callback?: HandlerCallback
    ) => {
        // Compose transfer context
        const transferContext = composeContext({
            state: state,
            template: transferTemplate,
            templatingEngine: "handlebars",
        });

        // Generate transfer content
        const content = await generateObjectDeprecated({
            runtime: _runtime,
            context: transferContext,
            modelClass: ModelClass.SMALL,
        });

        const paramOptions: CosmosTransferParams = {
            fromChain: content.fromChain,
            denomOrIbc: content.denomOrIbc,
            amount: content.amount,
            toAddress: content.toAddress,
        };

        const walletProvider: CosmosWalletChainsData =
            await CosmosWalletProvider.initWalletChainsData(_runtime);

        const action = new TransferAction(walletProvider);

        try {
            const transferResp = await action.transfer(paramOptions);
            if (_callback) {
                _callback({
                    text: `Successfully transferred ${paramOptions.amount} tokens to ${paramOptions.toAddress}\nTransaction Hash: ${transferResp.txHash}`,
                    content: {
                        success: true,
                        hash: transferResp.txHash,
                        amount: paramOptions.amount,
                        recipient: transferResp.to,
                        chain: content.fromChain,
                    },
                });
            }
            return true;
        } catch (error) {
            console.error("Error during token transfer:", error);
            if (_callback) {
                _callback({
                    text: `Error transferring tokens: ${error.message}`,
                    content: { error: error.message },
                });
            }
            return false;
        }
    },
    template: transferTemplate,
    validate: async (runtime: IAgentRuntime) => {
        try {
            await CosmosWalletProvider.initWalletChainsData(runtime);

            return true;
        } catch {
            return false;
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Make transfer {{0.0001 OM}} to {{mantra1pcnw46km8m5amvf7jlk2ks5std75k73aralhcf}} on {{mantrachaintestnet2}}",
                    action: "COSMOS_TRANSFER",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "",
                    action: "COSMOS_TRANSFER",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Transfer {{0.0001 OM}} to {{mantra1pcnw46km8m5amvf7jlk2ks5std75k73aralhcf}} on {{mantrachaintestnet2}}",
                    action: "COSMOS_TRANSFER",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "",
                    action: "COSMOS_TRANSFER",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Send {{0.0001 OM}} on {{mantrachaintestnet2}} to {{mantra1pcnw46km8m5amvf7jlk2ks5std75k73aralhcf}}",
                    action: "COSMOS_TRANSFER",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "",
                    action: "COSMOS_TRANSFER",
                },
            },
        ],
    ],
    similes: [
        "COSMOS_SEND_TOKENS",
        "COSMOS_TOKEN_TRANSFER",
        "COSMOS_MOVE_TOKENS",
    ],
};
