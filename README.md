Google Cloud Function - Mailgun Inbound Emails
==============================================

Google Cloud Function for receiving inbound emails from Mailgun

Features
--------
- Receives messages POSTed by Mailgun (via forwarding route)
- Saves parsed message data to Google Datastore
- Saves email attachments to Google Cloud Storage
- Saves email metadata to Google Datastore (descendent of message)

TODO
----
1. Create `npm` package for `EmailProcessor` -- parametetise config and make project agnostic
2. Add functionality for webhook to receive "notify" requests from Mailgun (vs "forward")
3. Add tests
