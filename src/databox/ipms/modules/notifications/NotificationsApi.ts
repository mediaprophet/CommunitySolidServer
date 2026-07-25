/* eslint-disable max-len */
import type { IpmsModuleRouter } from '../../IpmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { readJsonBody, writeJson } from '../../IpmsHttpUtils';
import type { ChannelSubscriptionInput, NotificationInput, NotificationQuery } from './Notifications';
import {
  buildNotification,
  buildSubscription,
  markNotificationRead,
  queryNotifications,
} from './Notifications';

export function registerNotificationsRoutes(router: IpmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  router.register('POST', '/notifications/create', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      writeJson(response, 200, buildNotification(input as NotificationInput), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid notification request.' });
    }
  });

  router.register('POST', '/notifications/subscribe', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      writeJson(response, 200, buildSubscription(input as ChannelSubscriptionInput), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid subscription request.' });
    }
  });

  router.register('POST', '/notifications/read', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<{ notificationId: string; readAt: string }>(request);
      writeJson(response, 200, markNotificationRead(input.notificationId, input.readAt), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid mark-read request.' });
    }
  });

  router.register('POST', '/notifications/query', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      const query = input as NotificationQuery & { notifications?: NotificationInput[] };
      const notifications = (query.notifications ?? []).map(n => buildNotification(n));
      const results = queryNotifications(notifications, query);
      writeJson(response, 200, { results: results.map(r => r.record), count: results.length }, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid query request.' });
    }
  });
}
