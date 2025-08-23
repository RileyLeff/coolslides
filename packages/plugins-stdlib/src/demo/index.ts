/**
 * Demo Logger Plugin
 * Shows a small toast on slide changes using ui.notifications
 */

export default {
  name: '@coolslides/plugins-demo-logger',
  capabilities: ['ui.notifications', 'telemetry.events'],
  
  async init(ctx: any) {
    const toast = ctx.capabilities?.['ui.notifications'];
    const telemetry = ctx.capabilities?.['telemetry.events'];

    ctx.bus.on('slide:enter', ({ slideId }: any) => {
      toast?.show?.(`Slide: ${slideId}`);
      telemetry?.emit?.('slide:enter', { slideId });
    });
  }
};

