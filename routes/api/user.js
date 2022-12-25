const express = require('express');
const router = express.Router();
const gravatar = require('gravatar');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('config');
const { check, validationResult } = require('express-validator');
const User = require('../../models/User');
const Profile = require('../../models/Profile');
const Mood = require('../../models/Mood');
const Step = require('../../models/Step');
const Mcq = require('../../models/Mcq');
const Course = require('../../models/Course');
const Progress = require('../../models/Progress');
const FormSubmit = require('../../models/FormSubmit');
const nodemailer = require('nodemailer');
const auth = require('../../middleware/auth');
const { google } = require('googleapis');

const cid = process.env.cid;
const csec = process.env.csec;
const ruri = process.env.ruri;
const accessToken = process.env.accessToken;
const refreshToken = process.env.refreshToken;

const oAuth2Client = new google.auth.OAuth2(cid, csec, ruri);
oAuth2Client.setCredentials({
	refresh_token: refreshToken,
	access_token: accessToken
});

//route    POST api/user
//desc     Register user
//@access  Public
router.post(
	'/',
	[
		check('name', 'Name is Required').notEmpty(),
		check('email', 'Please enter a valid email').isEmail(),
		check('password', 'Please enter a password with 6 or more characters').isLength({
			min: 6
		})
	],
	async (req, res) => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			return res.status(400).json({
				errors: errors.array()
			});
		}

		const { name, email, password } = req.body;

		try {
			let user = await User.findOne({
				email
			});

			if (user) {
				return res.status(400).json({
					errors: [
						{
							msg: 'User Already exists'
						}
					]
				});
			}

			//Creating a new user object
			user = new User({
				name,
				email,
				password
			});

			const salt = await bcrypt.genSalt(10);

			user.password = await bcrypt.hash(password, salt);
			user.confirmed = false;

			//Saving the data in database
			await user.save();

			//Simultaneously creating profile and mood object and saving in database
			const profileFields = {};
			profileFields.user = user.id;
			const profile = new Profile(profileFields);
			profile.save();

			const moodFields = {};
			moodFields.user = user.id;
			const mood = new Mood(moodFields);
			mood.save();

			// const steps= new Step.find();
			let steps = await Step.find();
			const progressFields = {};
			progressFields.progressArray = [];
			progressFields.user = user.id;

			steps.forEach((k) => {
				let e = k.toObject();
				const final = {};
				final.data = [];
				final.data = e.data;
				final.total = e.data.length;
				final.percentage = 0;
				final.step = e.name;
				final.videos = [];
				e.data.forEach((k) => {
					val = {};
					val.watchPercentage = 0;
					final.videos.push(val);
				});
				progressFields.progressArray.push(final);
			});

			const progress = new Progress(progressFields);
			await progress.save();

			const subs = await Course.find();
			const mcqFields = {};
			mcqFields.sums = [];
			mcqFields.user = user.id;

			subs.forEach((e) => {
				e.courses.forEach((k) => {
					const sum = {};
					sum.mcq = k.mcq.name;
					sum.sumArray = [];
					if (sum.mcq) {
						mcqFields.sums.push(sum);
					}
				});
			});
			const subsArray = new Mcq(mcqFields);
			subsArray.save();

			const formFields = {};
			formFields.user = user.id;
			const finalform = new FormSubmit(formFields);
			finalform.save();

			//Appending the user ID at the back of email link to make it unique
			const uniqueString = user.id;
			sendEmail(email, uniqueString, 0);
			res.send('user added');
		} catch (err) {
			console.log(err.message);
			res.status(500).send('Server Error');
		}
	}
);

//route    POST api/user/social
//desc     Social Login
//@access  Public
router.post('/social', async (req, res) => {
	//get email and name from facebook or google
	const { name, email, avatar } = req.body;
	try {
		let user = await User.findOne({ email });
		let confirmed = true;

		//If user with given email doesn't exist, create a new user
		if (!user) {
			user = new User({
				name,
				email,
				confirmed
			});
			await user.save();

			//Simultaneously creating profile and mood object and saving in database
			const profileFields = {};
			profileFields.user = user.id;
			profileFields.coverImage = avatar;
			const profile = new Profile(profileFields);
			await profile.save();

			const moodFields = {};
			moodFields.user = user.id;
			const mood = new Mood(moodFields);
			await mood.save();

			const formFields = {};
			formFields.user = user.id;
			formFields.responses = [];
			const finalform = new FormSubmit(formFields);
			await finalform.save();

			let steps = await Step.find();
			const progressFields = {};
			progressFields.progressArray = [];
			progressFields.user = user.id;

			steps.forEach((k) => {
				let e = k.toObject();
				const final = {};
				final.data = [];
				final.data = e.data;
				final.total = e.data.length;
				final.percentage = 0;
				final.step = e.name;
				final.videos = [];
				e.data.forEach((k) => {
					val = {};
					val.watchPercentage = 0;
					final.videos.push(val);
				});
				progressFields.progressArray.push(final);
			});

			const progress = new Progress(progressFields);
			await progress.save();

			const subs = await Course.find();
			const mcqFields = {};
			mcqFields.sums = [];
			mcqFields.user = user.id;

			subs.forEach((e) => {
				e.courses.forEach((k) => {
					const sum = {};
					sum.mcq = k.mcq.name;
					sum.sumArray = [];
					if (sum.mcq) {
						mcqFields.sums.push(sum);
					}
				});
			});
			const subsArray = new Mcq(mcqFields);
			await subsArray.save();
		}

		/*
		If user has manually registered on the website, 
		the email will not be confirmed unless the verification link is accessed.
		If this user tries to use social login, we will first set confirmed to true
		*/
		if (!user.confirmed) {
			user.confirmed = true;
		}
		user.coverimage = avatar;

		user.save();

		const payload = {
			user: {
				id: user.id
			}
		};
		jwt.sign(
			payload,
			config.get('jwtSecret'),
			{
				expiresIn: 360000
			},
			(err, token) => {
				if (err) throw err;
				res.send({ token });
			}
		);
	} catch (err) {
		console.log(err.message);
		res.status(500).send('Server Error');
	}
});

router.delete('/delete', async (req, res) => {
	const { email } = req.body;
	try {
		let user = await User.findOne({ email });
		if (user) {
			let id = user.id;
			await User.deleteOne({ _id: user.id });
			await Profile.deleteOne({ user: user.id });
			await Mood.deleteOne({ user: user.id });
			await Mcq.deleteOne({ user: user.id });
			await FormSubmit.deleteOne({ user: user.id });
			await Progress.deleteOne({ user: user.id });
			res.send(`${email} deleted`);
		} else res.send('no such user');
	} catch (err) {
		res.status(500).send(err);
	}
});

//Function to send email using nodemailer
const sendEmail = async (email, uniqueString, reset) => {
	try {
		//Account details of the sender
		//const accessToken = await oAuth2Client.getAccessToken();
		const transporter = nodemailer.createTransport({
			service: 'gmail',
			secure: true,
			pool: 'true',
			auth: {
				type: 'OAuth2',
				user: 'adarsh7506774609@gmail.com',
				clientId: cid,
				clientSecret: csec,
				refreshToken: refreshToken
			}
		});
		//Email sender
		const mailOptions1 = {
			from: 'Saorsa <adarsh7506774609@gmail.com>',
			to: email,
			subject: 'Verification Email',
			html: `Press <button><a href=https://mighty-bastion-04883.herokuapp.com/api/user/verify/${uniqueString}>here</a></button> to verify your account`
		};

		const mailOptions2 = {
			from: 'Saorsa <adarsh7506774609@gmail.com>',
			to: email,
			subject: 'Reset Password',
			html: `Press <button><a href=https://mighty-bastion-04883.herokuapp.com/api/user/forgot/${uniqueString}>here</a></button> to verify your account and reset the passwprd`
		};

		await transporter.sendMail(!reset ? mailOptions1 : mailOptions2, (error, info) => {
			if (error) {
				console.log(error);
			} else {
				console.log('Email Sent: ' + info.response);
			}
		});
	} catch (err) {
		console.log(err);
	}
};

//route    GET api/user/forgot/:uniqueString
//desc     Send verification link
//@access  Public
router.get('/forgot/:uniqueString', async (req, res) => {
	try {
		const token = req.params.uniqueString;
		const user = await User.findOne({ email: token.email });
		let base64Url = token.split('.')[1]; // token you get
		let base64 = base64Url.replace('-', '+').replace('_', '/');
		let decodedData = JSON.parse(Buffer.from(base64, 'base64').toString('binary'));

		const salt = await bcrypt.genSalt(10);
		const password = await bcrypt.hash(decodedData.password, salt);

		await User.updateOne({ email: decodedData.email }, { password }, { upsert: true });
		res.redirect('https://saorsawellbeing.herokuapp.com/login');
	} catch (err) {
		res.status(500).send('Server Error');
	}
});

//route    GET api/user/verify/:uniqueString
//desc     Send verification link
//@access  Public
router.get('/verify/:uniqueString', async (req, res) => {
	try {
		const user = await User.findOne({
			_id: req.params.uniqueString
		});
		user.confirmed = true;
		user.save();
		res.redirect('https://saorsawellbeing.herokuapp.com/login');
	} catch (err) {
		res.status(500).send('Server Error');
	}
});

//route    POST api/user/resend
//desc     Resend verification link to given email
//@access  Public
router.post('/resend', async (req, res) => {
	//taking email from user
	const { email } = req.body;
	try {
		const user = await User.findOne({ email });
		sendEmail(user.email, user.id, 0);
		res.send('Email Sent');
	} catch (err) {
		res.send(err);
	}
});

//route    POST api/user/forgot
//desc     Forgot password
//@access  Public
router.post('/forgot', async (req, res) => {
	//taking email from user
	const { email, password } = req.body;
	try {
		const user = await User.findOne({ email });
		const token = jwt.sign({ email, password }, process.env.RESET_PASSWORD_KEY, { expiresIn: '20m' });
		sendEmail(user.email, token, 1);
		res.send('Email Sent');
	} catch (err) {
		res.send(err.message);
	}
});

//route    GET api/user/all
//desc     Get all Users
//@access  Public
router.get('/all', async (req, res) => {
	try {
		const users = await User.find().select('-password');
		res.send(users);
	} catch (err) {
		res.send(err);
	}
});

module.exports = router;
