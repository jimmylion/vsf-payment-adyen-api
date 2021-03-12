import { apiStatus } from "../../../lib/util";
import { Router } from "express";
import { multiStoreConfig } from '../../../platform/magento2/util'
import cache from '../../../lib/cache-instance'
const {Client, Config, CheckoutAPI} = require('@adyen/api-library');
const Magento2Client = require("magento2-rest-client").Magento2Client;
const querystring = require('querystring')

const crypto = require('crypto');

function generateToken({ stringBase = 'base64', byteLength = 48 } = {}) {
  return new Promise((resolve, reject) => {
    crypto.randomBytes(byteLength, (err, buffer) => {
      if (err) {
        reject(err);
      } else {
        resolve(buffer.toString(stringBase));
      }
    });
  });
}

const pdKeyExpiryTime = 60 * 10 // 10 minutes
const createQuotePaymentDataKey = (quoteId, ip, isPd = true) => {
  return `${isPd ? 'adyen-pd' : 'adyen-unique-token'}:${quoteId}:${ip}`
}

const getUserIp = (req) => {
  return req.headers['x-forwarded-for'] ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    (req.connection.socket ? req.connection.socket.remoteAddress : null);
}

const saveCache = (key, paymentData) => {
  if (cache) {
    return cache.set(key, paymentData, [], { timeout: pdKeyExpiryTime })
  } else {
    throw new Error('Enable Redis cache to support Adyen 3ds1')
  }
}

const getCache = (key) => {
  if (cache) {
    return cache.get(key)
  } else {
    console.log('Enable Redis cache to support Adyen 3ds1')
  }
}

const generateSuccessKey = (userIp) => {
  return generateToken() + userIp
}

module.exports = ({ config, db }) => {
  let mcApi = Router();

  // mcApi.post('/finalize-3ds1', (req, res) => {

  //   if (!req.query.quoteId) {
  //     apiStatus(res, 'quoteId not provided', 400)
  //     return
  //   }

  //   if (!req.query.storeCode) {
  //     apiStatus(res, 'storeCode not provided', 400)
  //     return
  //   }

  //   const { quoteId, storeCode } = req.query

  //   let body = '';
  //   req.on('data', chunk => {
  //       body += chunk.toString(); // convert Buffer to string
  //   });
  //   req.on('end', async () => {
  //       // Get data
  //       const pairs = body.split('&')
  //       const details = {}
  //       for (const pair of pairs) {
  //         const [key, value] = pair.split('=')
  //         details[key] = querystring.unescape(value)
  //       }

  //       // Prepare checkout instance
  //       const adyenConfig = new Config();
  //       adyenConfig.apiKey = config.extensions.adyen.apiKey
  //       adyenConfig.merchantAccount = config.extensions.adyen.merchantAccount

  //       const client = new Client({ config: adyenConfig })
  //       client.setEnvironment(config.extensions.adyen.environment)
  //       const checkout = new CheckoutAPI(client)

  //       // Get pd frm redis
  //       const paymentData = await getCache(createQuotePaymentDataKey(quoteId, getUserIp(req)))
  //       if (!paymentData) {
  //         apiStatus(res, 'paymentData does not exist', 500)
  //       }
  //       console.log(details)
  //       try {
  //         const adyenResponse = await checkout.paymentsDetails({
  //           details,
  //           paymentData,
  //         })
  //         console.log(adyenResponse, 'Adyen Response')
  //         // // Send request to m2
  //         const client = Magento2Client(multiStoreConfig(config.magento2.api, req));
  //         client.addMethods("adyen", function(restClient) {
  //           var module = {};

  //         //   module.authorize3ds1 = async function() {

  //         //     let userId = null
  //         //     if (req.query.token) {
  //         //       try {
  //         //         let { id } = await client.customers.me(req.query.token)
  //         //         userId = id
  //         //       } catch (err) {
  //         //         console.log(err)
  //         //       }
  //         //     }

  //         //     return restClient.post('/adyen/threeDSProcess', {
  //         //       payload: JSON.stringify({
  //         //         quote_id: req.query.quoteId,
  //         //         ...(userId ? {customer_id: userId} : {}),
  //         //         ...details,
  //         //         paymentData
  //         //       })
  //         //     }, '', {
  //         //       'User-Agent': req.headers['user-agent']
  //         //     }).then(response => JSON.parse(response))
  //         //     .catch(err => {
  //         //       console.log(err)
  //         //       throw err
  //         //      })

  //         //   };

  //         module.auth3ds1 = async function() {

  //           let userId = null
  //           if (req.query.token) {
  //             try {
  //               let { id } = await client.customers.me(req.query.token)
  //               userId = id
  //             } catch (err) {
  //               console.log(err)
  //             }
  //           }
  //           console.log('I am sending', {
  //             quote_id: req.query.quoteId,
  //             ...(userId ? {customer_id: userId} : {}),
  //             response: adyenResponse
  //             // ...details,
  //             // paymentData
  //           })
  //           return restClient.post('/adyen/threeDSProcess', {
  //             payload: JSON.stringify({
  //               quote_id: req.query.quoteId,
  //               ...(userId ? {customer_id: userId} : {}),
  //               response: adyenResponse
  //               // ...details,
  //               // paymentData
  //             })
  //           }, '', {
  //             'User-Agent': req.headers['user-agent']
  //           }).then(response => JSON.parse(response))
  //           .catch(err => { throw err })

  //         };

  //           return module;
  //         });

  //         let redirectUrl
  //         if (adyenResponse && adyenResponse.resultCode) {
  //           const baseUrl = config.extensions.adyen.pwaOrigin && config.extensions.adyen.pwaOrigin.endsWith('/') ? config.extensions.adyen.pwaOrigin : `${config.extensions.adyen.pwaOrigin}/`
  //           switch (adyenResponse.resultCode) {
  //             case 'Cancelled':
  //               // message = 'Your payment has been cancelled. We might suspect a fraud'
  //               redirectUrl = `${baseUrl}${storeCode}/checkout#error-3ds1-cancel`
  //               break;
  //             case 'Authorised':
  //               let m2Response = await client.adyen.auth3ds1()
  //               console.log(m2Response)
  //               if (m2Response.resultCode === 'OK') {
  //                 redirectUrl = `${baseUrl}${storeCode}/checkout#success`
  //               } else {
  //                 redirectUrl = `${baseUrl}${storeCode}/checkout#error-3ds1-m2-refused`
  //               }
  //               break;
  //             case 'Error':
  //               // message = 'There was an error processing your payment'
  //               redirectUrl = `${baseUrl}${storeCode}/checkout#error-3ds1-err`
  //               break;
  //             case 'Refused':
  //               // message = `Your payment has been refused`
  //               redirectUrl = `${baseUrl}${storeCode}/checkout#error-3ds1-refused`
  //               break;
  //             default:
  //               redirectUrl = `${baseUrl}${storeCode}/checkout#error-3ds1-unknown`
  //           }

  //           res.redirect(redirectUrl)
  //           return
  //         }

  //         // apiStatus(res, message, code)
  //         // return
  //       } catch (err) {
  //         console.log(err)
  //         apiStatus(res, 'Badly configured API', 500)
  //         return
  //       }
  //   });
  // })

  mcApi.post("/vault", (req, res) => {

    const client = Magento2Client(multiStoreConfig(config.magento2.api, req));

    if (!req.query.token) {
			return apiStatus(res, 'Token not provided', 500)
    }

    client.addMethods("adyen", function(restClient) {
      var module = {};

      module.vault = function(customerToken) {
        return restClient.get('/mma/me/vault/items', customerToken)
      };
      return module;
    });

    client.adyen
      .vault(req.query.token)
      .then(result => {
        apiStatus(res, result, 200);
      })
      .catch(err => {
        apiStatus(res, err, 500);
      });
  });

  mcApi.post("/methods/:storeCode/:cartId", (req, res) => {

    const client = Magento2Client({
      ...config.magento2.api,
      url:
        config.magento2.api.url.replace("/rest", "/") +
        req.params.storeCode +
        "/rest"
    });

    client.addMethods("adyen", function(restClient) {
      var module = {};

      module.methods = async function(customerToken, cartId) {

        if (customerToken && !isNaN(cartId)) {
          return restClient.post('/carts/mine/retrieve-adyen-payment-methods', {
            cart_id: cartId
          }, customerToken)
        } else {
          if (req.body.shippingAddress) {
            return restClient.post(`/guest-carts/${cartId}/retrieve-adyen-payment-methods`, {
              shippingAddress: req.body.shippingAddress,
              cartId
            });
          }
          return restClient.post(`/guest-carts/${cartId}/retrieve-adyen-payment-methods`);
        }
      };

      return module;
    });

    client.adyen
      .methods(req.query.token ? req.query.token : null, req.params.cartId)
      .then(result => {
        const jsonRes = JSON.parse(result)
        const paymentMethods = jsonRes && jsonRes.paymentMethodsResponse && jsonRes.paymentMethodsResponse.paymentMethods || []
        apiStatus(res, paymentMethods, 200);
      })
      .catch(err => {
        apiStatus(res, err, 500);
      });
  });

  // mcApi.patch("/payment-information/:storeCode", (req, res) => {

  //   if (!req.params.storeCode) {
	// 		return apiStatus(res, 'storeCode not provided', 500)
  //   }

  //   if (!req.body.paymentMethod) {
	// 		return apiStatus(res, 'paymentMethod not provided', 500)
  //   }

  //   if (!req.query.token) {
	// 		return apiStatus(res, 'token not provided', 500)
  //   }

  //   const client = Magento2Client({
  //     ...config.magento2.api,
  //     url:
  //       config.magento2.api.url.replace("/rest", "/") +
  //       req.params.storeCode +
  //       "/rest"
  //   });

  //   client.addMethods("adyen", function(restClient) {
  //     var module = {};

  //     module.patchInformation = async function(customerToken) {
  //         return restClient.post('/carts/mine/set-payment-information', {
  //           paymentMethod: req.body.paymentMethod
  //         }, customerToken)
  //     };
  //     return module;
  //   });

  //   client.adyen
  //     .patchInformation(req.query.token)
  //     .then(result => {
  //       apiStatus(res, result, 200);
  //     })
  //     .catch(err => {
  //       apiStatus(res, err, 500);
  //     });
  // });

  // mcApi.post("/payment/start/:storeCode/:quoteId", (req, res) => {
  //   if (!req.params.storeCode) {
	// 		return apiStatus(res, 'storeCode not provided', 500)
  //   }

  //   if (!req.body.additional_data) {
	// 		return apiStatus(res, 'additional_data not provided', 500)
  //   }

  //   if (!req.body.method) {
	// 		return apiStatus(res, 'method not provided', 500)
  //   }

  //   if (!req.params.quoteId) {
	// 		return apiStatus(res, 'quoteId and token not provided', 500)
  //   }

  //   const client = Magento2Client({
  //     ...config.magento2.api,
  //     url:
  //       config.magento2.api.url.replace("/rest", "/") +
  //       req.params.storeCode +
  //       "/rest"
  //   });

  //   client.addMethods("adyen", function(restClient) {
  //     var module = {};

  //     module.init = async function() {

  //       let userId = null
  //       if (req.query.token) {
  //         try {
  //           let { id } = await client.customers.me(req.query.token)
  //           userId = id
  //         } catch (err) {
  //           console.log(err)
  //         }
  //       }

  //       return restClient.post('/adyen/payment', {
  //         payload: {
  //           quote_id: req.params.quoteId,
  //           ...(userId ? {customer_id: userId} : {}),
  //           method: 'adyen_cc',
  //           additional_data: req.body.additional_data
  //         }
  //       }, '', {
  //         'User-Agent': req.headers['user-agent']
  //       }).then(response => JSON.parse(response))
  //       .catch(err => {
  //         console.log(err)
  //         throw err
  //        })

  //     };
  //     return module;
  //   });

  //   client.adyen
  //     .init()
  //     .then(async result => {
  //       if (result && result.type == 'RedirectShopper' && result.action && result.action.paymentData) {
  //         const pdKey = createQuotePaymentDataKey(req.params.quoteId, getUserIp(req))
  //         const paymentData = result.action.paymentData
  //         // Unique success key
  //         const usKey = createQuotePaymentDataKey(req.params.quoteId, getUserIp(req), false)
  //         const successKey = generateSuccessKey(getUserIp(req))
  //         console.log('pd', pdKey)
  //         try {
  //           await saveCache(pdKey, paymentData)
  //           await saveCache(usKey, successKey)
  //           console.log('saved pd', pdKey, paymentData)
  //         } catch (err) {
  //           console.log(err)
  //           apiStatus(res, err, 500);
  //           return
  //         }
  //       }
  //       apiStatus(res, result, 200);
  //     })
  //     .catch(err => {
  //       console.log(err)
  //       apiStatus(res, err, 500);
  //     });
  // })

  mcApi.get("/payment/status/:orderId", (req, res) => {
    if (!req.query.storeCode) {
			return apiStatus(res, 'storeCode not provided', 500)
    }

    if (!req.params.orderId) {
			return apiStatus(res, 'orderId not provided', 500)
    }

    const client = Magento2Client({
      ...config.magento2.api,
      url:
        config.magento2.api.url.replace("/rest", "/") +
        req.query.storeCode +
        "/rest"
    });

    client.addMethods("adyen", function(restClient) {
      var module = {};

      module.paymentStatus = async function() {

        return restClient.get(`/adyen/orders/${req.params.orderId}/payment-status`)
          .then(response => JSON.parse(response))
          .catch(err => { throw err })
      };
      return module;
    });

    client.adyen
      .paymentStatus()
      .then(result => {
        apiStatus(res, result, 200);
      })
      .catch(err => {
        apiStatus(res, err, 500);
      });
  })

  mcApi.post("/payment/fingerprint/:storeCode/:quoteId", (req, res) => {
    if (!req.params.storeCode) {
			return apiStatus(res, 'storeCode not provided', 500)
    }

    if (!req.body.fingerprint) {
			return apiStatus(res, 'fingerprint not provided', 500)
    }

    if (!req.body.orderId) {
			return apiStatus(res, 'orderId not provided', 500)
    }

    if (!req.params.quoteId) {
			return apiStatus(res, 'quoteId and token not provided', 500)
    }

    const client = Magento2Client({
      ...config.magento2.api,
      url:
        config.magento2.api.url.replace("/rest", "/") +
        req.params.storeCode +
        "/rest"
    });

    client.addMethods("adyen", function(restClient) {
      var module = {};

      module.init = async function() {

        let userId = null
        if (req.query.token) {
          try {
            let { id } = await client.customers.me(req.query.token)
            userId = id
          } catch (err) {
            console.log(err)
          }
        }

        return restClient.post('/adyen/threeDS2Process', {
          payload: JSON.stringify({
            quote_id: req.params.quoteId,
            orderId: req.body.orderId,
            ...(userId ? {customer_id: userId} : {}),
            details: {
              ...(req.body.challenge
                ? {"threeds2.challengeResult": req.body.fingerprint}
                : {"threeds2.fingerprint": req.body.fingerprint}
              )
            },
            ...(req.body.noPaymentData ? {} : { paymentData: "" })
          })
        }, '', {
          'User-Agent': req.headers['user-agent']
        }).then(response => JSON.parse(response))
        .catch(err => { throw err })
      };
      return module;
    });

    client.adyen
      .init()
      .then(result => {
        apiStatus(res, result, 200);
      })
      .catch(err => {
        apiStatus(res, err, 500);
      });
  })

  return mcApi;
};
