Tobolof
=======

A simple Google App Script to monitor your followers on Twitter

## Installation

To install Tobolof, copy the content of Tobolof.gs and paste it in a [Google App Script](https://script.google.com) file.

## Usage

Before running Tobolof for the first time, you'll need to do two things:

### Create a Twitter application

Please read this [tutorial](https://developers.google.com/apps-script/articles/twitter_tutorial) to learn how to create and setup a Twitter application.
Set the access level to `Read and write` and note down the `Consumer key` and `Consumer secret` that Twitter generates for you.

### Fill in the required information in the script file

Once the application has been created, update Tobolof.gs to set properly `USER`, `REPORT_MAIL_ADDRESS`, `CONSUMER_KEY` and `CONSUMER_SECRET`.

You can now optionally run the script manually for the first time by selecting the `main` function and clicking on the play icon.  This will generate the first report with all your current followers.

You can then make the script run regularly (say every 30min) by creating a time-driven trigger to run the `main` function.

You can also [follow me on Twitter](https://twitter.com/olaf_k).