import axios from 'axios';
import { elizaLogger } from '@elizaos/core';

// Cache for versions
let versionCache: {
    wordpress: string;
    php: string;
    lastUpdated: number;
} | null = null;

const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

export async function getLatestWordPressVersion(): Promise<string> {
    if (versionCache && Date.now() - versionCache.lastUpdated < CACHE_DURATION) {
        return versionCache.wordpress;
    }

    try {
        const response = await axios.get('https://api.wordpress.org/core/version-check/1.7/');
        const version = response.data.offers[0].version;

        versionCache = {
            wordpress: version,
            php: versionCache?.php || '8.2',
            lastUpdated: Date.now()
        };

        return version;
    } catch (error) {
        elizaLogger.error('Failed to fetch latest WordPress version:', error);
        return '6.5.3'; // Fallback to known stable version
    }
}

export async function getLatestPHPVersion(): Promise<string> {
    if (versionCache && Date.now() - versionCache.lastUpdated < CACHE_DURATION) {
        return versionCache.php;
    }

    try {
        const response = await axios.get('https://www.php.net/releases/active.php');
        const version = response.data[0].version;

        versionCache = {
            wordpress: versionCache?.wordpress || '6.5.3',
            php: version,
            lastUpdated: Date.now()
        };

        return version;
    } catch (error) {
        elizaLogger.error('Failed to fetch latest PHP version:', error);
        return '8.2'; // Fallback to known stable version
    }
}

export async function getLatestVersions(): Promise<{
    wordpress: string;
    php: string;
}> {
    const [wordpress, php] = await Promise.all([
        getLatestWordPressVersion(),
        getLatestPHPVersion()
    ]);

    return { wordpress, php };
}