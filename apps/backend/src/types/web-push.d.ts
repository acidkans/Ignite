declare module 'web-push' {
    interface PushSubscription {
        endpoint: string;
        keys: { p256dh: string; auth: string };
    }

    interface RequestOptions {
        vapidDetails?: { subject: string; publicKey: string; privateKey: string };
        TTL?: number;
        headers?: Record<string, string>;
    }

    function setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
    function sendNotification(subscription: PushSubscription, payload: string | Buffer, options?: RequestOptions): Promise<any>;

    export { setVapidDetails, sendNotification, PushSubscription, RequestOptions };
}
