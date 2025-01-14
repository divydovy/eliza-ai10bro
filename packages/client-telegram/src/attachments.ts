import { Telegraf } from "telegraf";
import { Message } from "@telegraf/types";
import {
    IAgentRuntime,
    IImageDescriptionService,
    IPdfService,
    ITranscriptionService,
    IVideoService,
    Media,
    ServiceType,
    elizaLogger,
} from "@elizaos/core";

export class AttachmentManager {
    private attachmentCache: Map<string, Media> = new Map();
    private runtime: IAgentRuntime;
    private bot: Telegraf;

    constructor(runtime: IAgentRuntime, bot: Telegraf) {
        this.runtime = runtime;
        this.bot = bot;
    }

    async processAttachments(message: Message): Promise<Media[]> {
        const processedAttachments: Media[] = [];

        try {
            if ("photo" in message && message.photo?.length > 0) {
                elizaLogger.info("Processing photo attachment");
                const photo = message.photo[message.photo.length - 1];
                const fileLink = await this.bot.telegram.getFileLink(photo.file_id);
                const media = await this.processImageAttachment(fileLink.toString(), photo.file_id);
                if (media) processedAttachments.push(media);
            }

            if ("document" in message && message.document) {
                elizaLogger.info("Processing document attachment:", {
                    fileName: message.document.file_name,
                    mimeType: message.document.mime_type,
                    fileId: message.document.file_id,
                    fileSize: message.document.file_size
                });

                const fileLink = await this.bot.telegram.getFileLink(message.document.file_id);
                const url = fileLink.toString();
                let media: Media | null = null;

                if (message.document.mime_type?.startsWith("image/")) {
                    elizaLogger.info("Processing document as image");
                    media = await this.processImageAttachment(url, message.document.file_id);
                } else if (message.document.mime_type?.startsWith("application/pdf")) {
                    elizaLogger.info("Processing document as PDF");
                    media = await this.processPdfAttachment(url, message.document.file_id);
                } else if (message.document.mime_type?.startsWith("text/plain")) {
                    elizaLogger.info("Processing document as plaintext");
                    media = await this.processPlaintextAttachment(url, message.document.file_id);
                } else {
                    elizaLogger.warn("Unsupported document type:", message.document.mime_type);
                }

                if (media) {
                    elizaLogger.info("Successfully processed document");
                    processedAttachments.push(media);
                } else {
                    elizaLogger.warn("Failed to process document");
                }
            }

            if ("video" in message && message.video) {
                elizaLogger.info("Processing video attachment");
                const fileLink = await this.bot.telegram.getFileLink(message.video.file_id);
                const media = await this.processVideoAttachment(fileLink.toString(), message.video.file_id);
                if (media) processedAttachments.push(media);
            }

            if ("voice" in message && message.voice) {
                elizaLogger.info("Processing voice attachment");
                const fileLink = await this.bot.telegram.getFileLink(message.voice.file_id);
                const media = await this.processAudioAttachment(fileLink.toString(), message.voice.file_id);
                if (media) processedAttachments.push(media);
            }

            if ("audio" in message && message.audio) {
                elizaLogger.info("Processing audio attachment");
                const fileLink = await this.bot.telegram.getFileLink(message.audio.file_id);
                const media = await this.processAudioAttachment(fileLink.toString(), message.audio.file_id);
                if (media) processedAttachments.push(media);
            }
        } catch (error) {
            elizaLogger.error("Error processing attachments:", error);
        }

        return processedAttachments;
    }

    private async processImageAttachment(url: string, id: string): Promise<Media | null> {
        if (this.attachmentCache.has(id)) {
            return this.attachmentCache.get(id)!;
        }

        try {
            const imageService = this.runtime.getService<IImageDescriptionService>(ServiceType.IMAGE_DESCRIPTION);
            if (!imageService) {
                throw new Error("Image description service not found");
            }

            const { title, description } = await imageService.describeImage(url);
            const media: Media = {
                id,
                url,
                title: title || "Image Attachment",
                source: "Image",
                description: description || "An image attachment",
                text: description || "Image content not available",
            };

            this.attachmentCache.set(id, media);
            return media;
        } catch (error) {
            elizaLogger.error("Error processing image attachment:", error);
            return null;
        }
    }

    private async processPdfAttachment(url: string, id: string): Promise<Media | null> {
        if (this.attachmentCache.has(id)) {
            return this.attachmentCache.get(id)!;
        }

        try {
            const response = await fetch(url);
            const pdfBuffer = await response.arrayBuffer();
            const pdfService = this.runtime.getService<IPdfService>(ServiceType.PDF);
            if (!pdfService) {
                throw new Error("PDF service not found");
            }

            const text = await pdfService.convertPdfToText(Buffer.from(pdfBuffer));
            const media: Media = {
                id,
                url,
                title: "PDF Attachment",
                source: "PDF",
                description: "A PDF document",
                text,
            };

            this.attachmentCache.set(id, media);
            return media;
        } catch (error) {
            elizaLogger.error("Error processing PDF attachment:", error);
            return null;
        }
    }

    private async processPlaintextAttachment(url: string, id: string): Promise<Media | null> {
        if (this.attachmentCache.has(id)) {
            return this.attachmentCache.get(id)!;
        }

        try {
            const response = await fetch(url);
            const text = await response.text();
            const media: Media = {
                id,
                url,
                title: "Text Attachment",
                source: "Text",
                description: "A text document",
                text,
            };

            this.attachmentCache.set(id, media);
            return media;
        } catch (error) {
            elizaLogger.error("Error processing text attachment:", error);
            return null;
        }
    }

    private async processVideoAttachment(url: string, id: string): Promise<Media | null> {
        if (this.attachmentCache.has(id)) {
            return this.attachmentCache.get(id)!;
        }

        try {
            const videoService = this.runtime.getService<IVideoService>(ServiceType.VIDEO);
            if (!videoService) {
                throw new Error("Video service not found");
            }

            if (videoService.isVideoUrl(url)) {
                const videoInfo = await videoService.processVideo(url, this.runtime);
                const media: Media = {
                    id,
                    url,
                    title: videoInfo.title,
                    source: "Video",
                    description: videoInfo.description,
                    text: videoInfo.text,
                };

                this.attachmentCache.set(id, media);
                return media;
            }
            return null;
        } catch (error) {
            elizaLogger.error("Error processing video attachment:", error);
            return null;
        }
    }

    private async processAudioAttachment(url: string, id: string): Promise<Media | null> {
        if (this.attachmentCache.has(id)) {
            return this.attachmentCache.get(id)!;
        }

        try {
            const response = await fetch(url);
            const audioBuffer = Buffer.from(await response.arrayBuffer());
            const transcriptionService = this.runtime.getService<ITranscriptionService>(ServiceType.TRANSCRIPTION);
            if (!transcriptionService) {
                throw new Error("Transcription service not found");
            }

            const transcription = await transcriptionService.transcribeAttachment(audioBuffer);
            const media: Media = {
                id,
                url,
                title: "Audio Attachment",
                source: "Audio",
                description: "An audio recording",
                text: transcription || "Audio content not available",
            };

            this.attachmentCache.set(id, media);
            return media;
        } catch (error) {
            elizaLogger.error("Error processing audio attachment:", error);
            return null;
        }
    }
}