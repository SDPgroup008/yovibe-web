exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    // PesaPal sends GET or POST with query parameters
    let orderTrackingId;
    let orderMerchantReference;
    let orderNotificationType;

    if (event.httpMethod === 'GET') {
      orderTrackingId = event.queryStringParameters?.OrderTrackingId || event.queryStringParameters?.orderTrackingId;
      orderMerchantReference = event.queryStringParameters?.OrderMerchantReference || event.queryStringParameters?.orderMerchantReference;
      orderNotificationType = event.queryStringParameters?.OrderNotificationType || event.queryStringParameters?.orderNotificationType;
    } else {
      const body = JSON.parse(event.body || '{}');
      orderTrackingId = body.OrderTrackingId || body.orderTrackingId;
      orderMerchantReference = body.OrderMerchantReference || body.orderMerchantReference;
      orderNotificationType = body.OrderNotificationType || body.orderNotificationType;
    }

    console.log('📋 PesaPal IPN received:');
    console.log('   - OrderTrackingId:', orderTrackingId);
    console.log('   - MerchantReference:', orderMerchantReference);
    console.log('   - NotificationType:', orderNotificationType);

    // TODO: Implement IPN handling:
    // 1. Verify payment status using getTransactionStatus (optional: could do async)
    // 2. Update Firebase ticket status if payment completed
    // 3. Send notification to buyer/organizer

    // For now, just acknowledge receipt
    // Pesapal expects a 200 OK response quickly. Do heavy processing async.
    if (orderTrackingId) {
      // You could trigger a background job here to verify and update ticket
      console.log('✅ IPN acknowledged. OrderTrackingId:', orderTrackingId);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        received: true,
        orderTrackingId: orderTrackingId || null,
        message: 'IPN notification received',
      }),
    };
  } catch (error) {
    console.error('❌ IPN error:', error);
    return {
      statusCode: 200, // Still return 200 to avoid PesaPal retries
      headers,
      body: JSON.stringify({
        received: true,
        message: 'IPN received with error (but acknowledged)',
      }),
    };
  }
};
