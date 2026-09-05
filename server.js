require("dotenv").config();

const express = require("express");

const app = express();

const PORT = process.env.PORT || 3000;


/* =====================================================
   MIDDLEWARE
===================================================== */

app.use(express.json());

app.use(
    express.urlencoded({
        extended: true
    })
);


/*
    Serve your website files.
*/

app.use(
    express.static(__dirname)
);



/* =====================================================
   PACKAGES
===================================================== */

const PACKAGES = {

    basic: {
        name: "Basic",
        amount: 30000,
        description:
            "1 Exterior Render - 4K - 1 Revision - 1 Day Delivery"
    },

    standard: {
        name: "Standard",
        amount: 60000,
        description:
            "3 High-Quality Renders - 8K - 2 Revisions - 2-3 Days Delivery"
    },

    premium: {
        name: "Premium",
        amount: 99900,
        description:
            "5 High-Quality Renders - 8K - 4 Revisions - Animation / Walkthrough - 3-4 Days Delivery"
    }

};



/* =====================================================
   CREATE PAYSTACK PAYMENT
===================================================== */

app.post(
    "/api/create-payment",
    async function(req, res) {

        try {

            const {
                packageType,
                email,
                name
            } = req.body;


            const selected =
                PACKAGES[packageType];


            if (!selected) {

                return res.status(400).json({

                    message:
                        "Invalid package selected."

                });

            }


            if (
                !email ||
                !/^[^\s@]+@[^\s@]+\.[^\s@]+$/
                    .test(email)
            ) {

                return res.status(400).json({

                    message:
                        "Please enter a valid email."

                });

            }


            if (
                !name ||
                name.trim().length < 2
            ) {

                return res.status(400).json({

                    message:
                        "Please enter your name."

                });

            }


            /*
                Your secret key MUST stay here.

                Never put this key inside HTML.
            */

            if (
                !process.env.PAYSTACK_SECRET_KEY
            ) {

                throw new Error(
                    "PAYSTACK_SECRET_KEY is missing."
                );

            }


            /*
                Unique payment reference.
            */

            const reference =
                "LUX-" +
                Date.now() +
                "-" +
                Math.random()
                    .toString(36)
                    .substring(2, 8);



            /* =================================================
               SEND TRANSACTION TO PAYSTACK
            ================================================= */

            const response =
                await fetch(
                    "https://api.paystack.co/transaction/initialize",
                    {

                        method: "POST",

                        headers: {

                            Authorization:
                                `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,

                            "Content-Type":
                                "application/json"

                        },


                        body: JSON.stringify({

                            email: email,

                            amount:
                                String(
                                    selected.amount
                                ),

                            currency: "GHS",

                            reference:
                                reference,


                            callback_url:
                                `${
                                    process.env.PUBLIC_URL ||
                                    `http://localhost:${PORT}`
                                }/payment-callback`,


                            channels: [
                                "card",
                                "mobile_money",
                                "bank_transfer",
                                "bank"
                            ],


                            metadata: {

                                customer_name:
                                    name.trim(),

                                package:
                                    selected.name,

                                description:
                                    selected.description

                            }

                        })

                    }
                );


            const data =
                await response.json();


            if (
                !response.ok ||
                !data.status
            ) {

                console.error(
                    "Paystack error:",
                    data
                );


                return res.status(502).json({

                    message:
                        data.message ||
                        "Paystack could not initialize payment."

                });

            }



            /*
                Send checkout URL
                back to the website.
            */

            res.json({

                authorization_url:
                    data.data.authorization_url,

                reference:
                    data.data.reference

            });

        }

        catch(error) {

            console.error(error);


            res.status(500).json({

                message:
                    error.message ||
                    "Payment initialization failed."

            });

        }

    }
);



/* =====================================================
   PAYMENT CALLBACK
===================================================== */

app.get(
    "/payment-callback",
    async function(req, res) {

        const reference =
            req.query.reference;


        if (!reference) {

            return res.status(400).send(

                paymentPage(
                    false,
                    "No payment reference was received."
                )

            );

        }


        try {

            if (
                !process.env.PAYSTACK_SECRET_KEY
            ) {

                throw new Error(
                    "PAYSTACK_SECRET_KEY is missing."
                );

            }


            /*
                Ask Paystack to verify
                the transaction.
            */

            const response =
                await fetch(

                    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,

                    {

                        headers: {

                            Authorization:
                                `Bearer ${process.env.PAYSTACK_SECRET_KEY}`

                        }

                    }

                );


            const data =
                await response.json();


            if (
                !response.ok ||
                !data.status
            ) {

                return res.status(400).send(

                    paymentPage(
                        false,
                        data.message ||
                        "Payment could not be verified."
                    )

                );

            }


            const transaction =
                data.data;



            /* =================================================
               VERIFY PAYMENT
            ================================================= */

            const validStatus =
                transaction.status ===
                "success";


            const validCurrency =
                transaction.currency ===
                "GHS";


            const packageName =
                transaction
                    .metadata
                    ?.package;


            const selected =
                Object.values(
                    PACKAGES
                ).find(
                    item =>
                        item.name ===
                        packageName
                );


            const validAmount =
                selected &&
                Number(transaction.amount) ===
                Number(selected.amount);



            /*
                Do NOT treat a transaction
                as paid unless all checks pass.
            */

            if (
                !validStatus ||
                !validCurrency ||
                !validAmount
            ) {

                console.warn(
                    "Payment verification failed:",
                    {
                        reference,
                        status:
                            transaction.status,
                        amount:
                            transaction.amount,
                        currency:
                            transaction.currency
                    }
                );


                return res.status(400).send(

                    paymentPage(
                        false,
                        "Payment could not be verified."
                    )

                );

            }



            /* =================================================
               PAYMENT SUCCESS
            ================================================= */

            console.log(
                "VERIFIED LUX PAYMENT:",
                {
                    reference,
                    package:
                        packageName,
                    amount:
                        transaction.amount,
                    email:
                        transaction.customer?.email
                }
            );


            return res.send(

                paymentPage(

                    true,

                    `Payment confirmed for your ${packageName} package.`,

                    reference

                )

            );

        }

        catch(error) {

            console.error(error);


            res.status(500).send(

                paymentPage(

                    false,

                    "There was a problem verifying your payment."

                )

            );

        }

    }
);



/* =====================================================
   PAYMENT RESULT PAGE
===================================================== */

function paymentPage(
    success,
    message,
    reference = ""
) {

    return `

<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<meta
    name="viewport"
    content="width=device-width,initial-scale=1.0"
>

<title>

${
    success
        ? "Payment Confirmed"
        : "Payment Issue"
}

 | LUX

</title>


<style>

* {
    box-sizing: border-box;
}


body {

    margin: 0;

    min-height: 100vh;

    display: flex;

    align-items: center;

    justify-content: center;

    padding: 25px;

    background: #111;

    color: #fff;

    font-family: Arial, sans-serif;

}


.card {

    width: min(
        620px,
        100%
    );

    padding: 55px;

    background: #151515;

    border: 1px solid #333;

}


.label {

    color: #666;

    font-size: 10px;

    letter-spacing: 3px;

}


.mark {

    margin: 25px 0;

    font-size: 60px;

}


h1 {

    margin: 0 0 20px;

    font-size: 44px;

    font-weight: 400;

    letter-spacing: -2px;

}


p {

    color: #888;

    line-height: 1.8;

}


.reference {

    margin-top: 30px;

    padding: 15px;

    border: 1px solid #333;

    color: #aaa;

    font-size: 12px;

    word-break: break-all;

}


.back {

    display: inline-block;

    margin-top: 30px;

    padding: 15px 22px;

    background: #fff;

    color: #111;

    text-decoration: none;

    font-size: 10px;

    letter-spacing: 2px;

}

</style>

</head>


<body>


<div class="card">


<div class="label">

LUX VISUALIZATION STUDIO

</div>


<div class="mark">

${
    success
        ? "✓"
        : "!"
}

</div>


<h1>

${
    success
        ? "Payment confirmed."
        : "Payment needs attention."
}

</h1>


<p>

${message}

</p>


${
    reference

        ? `

<div class="reference">

REFERENCE

<br><br>

${reference}

</div>

`

        : ""

}


<a
    href="/services.html"
    class="back">

BACK TO LUX

</a>


</div>


</body>

</html>

`;

}



/* =====================================================
   START SERVER
===================================================== */

app.listen(
    PORT,
    function() {

        console.log(
            `LUX running at http://localhost:${PORT}`
        );

    }
);