const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const mongoose = require("mongoose");
const session = require("express-session");
const cookieParser = require("cookie-parser");
let sendEmail = require(__dirname + "/email-send.js");

const app = express();

app.use(express.static("public"));
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({
    extended: true
}));

app.use(cookieParser());
app.use(session({
    resave: true,
    saveUninitialized: true,
    secret: "myRandomSecretDontChange"
}))

// Make sure you create this userDB in mongodb
mongoose.connect("mongodb://localhost:27017/userDB", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useFindAndModify: false
});

// The user_type in userSchema indicates if its a recruiter or a job seeker
const userSchema = {
    email: String,
    password: String,
    user_type: String,
    organization: String
};
const User = new mongoose.model("User", userSchema);


// Jobs Table for Recruiter
const eachJob = {
    id: String,
    title: String,
    description: String,
    expectations: String
}
const jobsSchema = {
    email: String,
    organization: String,
    jobs: {
        "type": "array",
        "items": {
            "type": eachJob
        }
    }
};
const Jobs = new mongoose.model("Jobs", jobsSchema);

// Seeker's profile table
const seekerSchema = {
    name: String,
    email: String,
    experience: String,
    description: String,
    jobsAppliedTo: {
        "type": "array",
        "items": {
            "type": {
                organization: String,
                id: String,
                status: String
            }
        }
    }
};
const Seeker = new mongoose.model("Seeker", seekerSchema);

// The applicants for each job (for the recruiter's view).
const applicantSchema = {
    jobId: String,
    applicants: {
        "type": "array",
        "items": {
            "type": {
                email: String,
                status: String
            }
        }
    }
}
const Applicant = new mongoose.model("Applicant", applicantSchema);

app.get("/", function (req, res) {
    res.render("home")
});

app.get("/register", function (req, res) {
    res.render("register")
});

app.get("/login", function (req, res) {
    res.render("login")
});

app.post("/register", function (req, res) {
    console.log(req.body);

    // If a user with thie email already exists
    User.exists({
        email: req.body.username
    }, function (err, foundResult) {
        if (err) {
            console.log(err);
        } else {
            if (foundResult) {
                res.send("User with this username already exists");
                // TODO: Send user to register page after giving this alert.
            } else {
                // Else create a new user and add it
                const newUser = new User({
                    email: req.body.username,
                    password: req.body.password,
                    user_type: req.body.recruiter_or_seeker,
                    organization: req.body.organization
                });

                // Session management, saving the user
                req.session.userEmail = req.body.username;
                req.session.userType = req.body.recruiter_or_seeker;
                req.session.userOrganization = req.body.organization;
                req.session.save();

                console.log("Saving session ", req.session.userEmail, req.session.userType);

                // Upon registering a seeker, save it in the Seeker table
                if (req.session.userType == "seeker") {
                    // Then we need to save it in seekers table also
                    const newSeeker = new Seeker({
                        email: req.session.userEmail,
                        organization: req.body.organization,
                        name: "unavailable",
                        experience: "unavailable",
                        description: "unavailable",
                        jobsAppliedTo: []
                    });
                    newSeeker.save(function (err) {
                        if (err) {
                            console.log(err);
                        } else {
                            console.log("Saved to seeker table");
                        }
                    })
                }
                // When recruiter registers, we initiate record in their job postings table
                else {
                    const newJobs = new Jobs({
                        email: req.session.userEmail,
                        organization: req.session.userOrganization,
                        jobs: []
                    });
                    newJobs.save(function (err) {
                        if (err) {
                            console.log(err);
                        } else {
                            console.log("Saved recruiter to jobs table");
                        }
                    })
                }
                newUser.save(function (err) {
                    if (err) {
                        console.log("UNABLE TO REGISTER USER")
                        console.log(err);
                    } else {
                        res.redirect("/home");
                    }
                });
            }
        }
    });
});

app.post("/login", function (req, res) {
    const username = req.body.username;
    const password = req.body.password;

    User.findOne({
        email: username
    }, function (err, foundUser) {
        if (err) {
            console.log("ERROR WHILE LOGIN")
            console.log(err);
        } else {
            if (foundUser) {
                if (foundUser.password === password) {
                    // Also extract the type of user (seeker or recruiter) from DB and keep in sessions.
                    req.session.userEmail = foundUser.email;
                    req.session.userType = foundUser.user_type;
                    req.session.userOrganization = foundUser.organization;
                    req.session.save();
                    console.log("Saving session ", req.session.userEmail, req.session.userType);

                    res.redirect("/home");
                } else {
                    // TODO: Make this also a new webpage, or just handle with frontend and rerender this page
                    res.send("Wrong username or password. Try again");
                }
            } else {
                // TODO: Make this also a new webpage, or just handle with frontend and rerender this page
                res.send("User not found");
            }
        }
    })
});

// This is the home page of either recruiter or seeker, depending on whose session has been logged in
app.get("/home", function (req, res) {
    console.log(req.session);
    if (!('userEmail' in req.session)) {
        // Then the user is logged out, so redirect them to sign in page
        res.redirect("/login");
    } else {
        console.log(req.session);
        if (req.session.userType == "seeker") {
            res.render("users/seeker/home", {
                organization: req.session.userOrganization
            });
        } else {
            res.render("users/recruiter/home", {
                organization: req.session.userOrganization
            });
        }
    }
})

// To view my profile
app.get("/profile", function (req, res) {
    // We first fetch the required information from the DB
    const userEmail = req.session.userEmail;
    Seeker.findOne({
        email: userEmail
    }, function (err, foundUser) {
        if (err) {
            console.log(err);
        } else {
            res.render("users/seeker/profile_view", {
                email: foundUser.email,
                organization: foundUser.organization,
                name: foundUser.name,
                experience: foundUser.experience,
                description: foundUser.description
            });
        }
    });

});

// To edit my profile
app.get("/profile_edit", function (req, res) {
    // We first fetch the required information from the DB
    const userEmail = req.session.userEmail;
    Seeker.findOne({
        email: userEmail
    }, function (err, foundUser) {
        if (err) {
            console.log(err);
        } else {
            res.render("users/seeker/profile_update", {
                email: foundUser.email,
                organization: foundUser.organization,
                name: foundUser.name,
                experience: foundUser.experience,
                description: foundUser.description
            });
        }
    });
});

// The route for after you submit the form for editting profile
app.post("/profile_edit", async function (req, res) {
    console.log(req.body);
    const userEmail = req.session.userEmail;

    await Seeker.findOneAndUpdate({
        email: userEmail
    }, {
        name: req.body.name,
        experience: req.body.experience,
        description: req.body.description
    });
    res.redirect("/profile");
});

// For seeker
app.get("/view_all_jobs", async function (req, res) {
    allJobsOfCompany = await Jobs.find();
    console.log(allJobsOfCompany);
    res.render("users/seeker/view_all_jobs", {
        allJobsOfCompany: allJobsOfCompany
    });
});

app.post("/view_job/:jobId", function (req, res) {
    const jobId = req.params.jobId;
    console.log(req.params.jobId);
    console.log(req.body.organization);
    console.log(req.body.email);
    Jobs.findOne({
        email: req.body.email
    }, function (err, foundJobs) {
        if (err) {
            console.log(err);
        } else {
            console.log(foundJobs);
            var matchedJob;
            foundJobs.jobs.forEach((job) => {
                if (job.id == jobId) {
                    res.render("view_each_job", {
                        job: job,
                        organization: req.body.organization,
                        email: req.body.email
                    });
                }
            });

        }
    });
    // res.send("Building");
});

app.post("/apply_for_job/:jobId", async function (req, res) {
    console.log(req.params.jobId);
    console.log(req.body);
    const applicant = req.session.userEmail;
    // First find the user and update the jobs they applied to
    const foundSeeker = await Seeker.findOneAndUpdate({
        email: applicant
    }, {
        $push: {
            jobsAppliedTo: {
                "organization": req.body.organization,
                "id": req.params.jobId,
                "status": "Applied"
            }
        }
    });
    console.log(foundSeeker);

    console.log("Pushing on ", applicant);
    const updatedApplicant = await Applicant.findOneAndUpdate({
        jobId: req.params.jobId
    }, {
        $push: {
            applicants: {
                "email": applicant,
                "status": "Applied"
            }
        }
    });
    console.log(updatedApplicant);
    res.send("Your application has been successfully submitted. Thank you for applying!");

});

app.get("/view_my_applied_jobs", async function (req, res) {
    const email = req.session.userEmail;
    const foundSeeker = await Seeker.findOne({
        email: email
    });
    console.log(foundSeeker);
    res.render("users/seeker/view_my_applied_jobs", {
        jobs: foundSeeker.jobsAppliedTo
    });
});

// For recruiter
app.get("/create_job", function (req, res) {
    res.render("users/recruiter/create_job");
});

app.post("/create_job", async function (req, res) {
    // Create job and add it to the DB
    console.log(req.body);

    // Generating a new id everytime
    const id = Date.now().toString(36) + Math.random().toString(36).substr(2);

    const job = {
        "id": id,
        "title": req.body.title,
        "description": req.body.description,
        "expectations": req.body.expectations
    }

    // Also make the entry in the Applicants table
    const newApplicant = new Applicant({
        jobId: id,
        applicants: []
    });
    await newApplicant.save();

    Jobs.findOneAndUpdate({
        email: req.session.userEmail
    }, {
        $push: {
            jobs: job
        }
    }, function (err, foundJobs) {
        if (err) {
            console.log(err);
        } else {
            console.log(foundJobs);
            res.redirect("/view_my_postings");
        }
    });
});

app.get("/view_my_postings", function (req, res) {
    Jobs.findOne({
        email: req.session.userEmail
    }, function (err, updatedJobs) {
        if (err) {
            console.log(err);
        }
        console.log(req.session.userEmail);
        console.log(updatedJobs);
        res.render("users/recruiter/view_my_job_postings", {
            jobs: updatedJobs.jobs
        });
    });
});

app.post("/search_for_recruiter", function (req, res) {
    console.log(req.body);
    Jobs.findOne({
        email: req.session.userEmail
    }, function (err, foundJobs) {
        matchedJobs = [];
        foundJobs.jobs.forEach((job) => {
            if (job.title == req.body.search) {
                matchedJobs.push(job);
            }
        });
        res.render("users/recruiter/view_my_job_postings", {
            jobs: matchedJobs
        });
    });
});

app.post("/view_applicants/:jobId", async function (req, res) {
    console.log(req.params.jobId);
    const jobId = req.params.jobId;

    Applicant.findOne({
        jobId: jobId
    }, function (err, foundApplicant) {
        if (err) {
            console.log(err);
        } else {
            console.log(foundApplicant.applicants);
            res.render("users/recruiter/view_applicants", {
                applicants: foundApplicant.applicants,
                jobId: jobId
            });
        }
    })
});

app.post("/reject_applicant/:jobId", function (req, res) {
    console.log(req.body);
    console.log(req.params.jobId);
    res.render("users/recruiter/reject_feedback", {
        jobId: req.params.jobId,
        applicant: req.body.applicant
    });
});

app.post("/rejection_feedback/:jobId", function (req, res) {
    console.log(req.body.applicant);
    console.log(req.params.jobId);

    // TODO: Send rejection mail
    // TODO: And the remove this applicant from list and update status to rejected

    res.send("Rejection mail has been sent");
});

app.post("/select_applicant/:jobId", function (req, res) {
    console.log(req.body);
    console.log(req.params.jobId);

    // TODO: Send selection mail
    // TODO: Update status in both places

    res.send("Selection mail has been sent");
});

app.post("/proceed_next_stage/:jobId", function (req, res) {
    console.log(req.body);
    console.log(req.params.jobId);

    // TODO: Send mail update
    // TODO: Update status in both places

    res.render("users/recruiter/proceed_next_stage", {
        jobId: req.params.jobId,
        applicant: req.body.applicant
    });
});

app.post("/send_interview_invites", function (req, res) {
    console.log(req.body);
    console.log(req.body.applicant);
    const interviewersEmail = req.body.email;
    const applicantsEmail = req.body.applicant;

    // TODO: Send google calendar invites, and automated emails.

    x = req.body.date;
    var dateObj = new Date(x);

    // TODO: Make this invite more specific by mentioning which company and what role they have applied to
    const subject = "Congratulation! Next Steps: Interview with the team";
    const text = "Congratulations! You have been selected for the next stage of the interview.\
    The interview will be scheduled on" + dateObj.toString() + ". All the very best!";

    // Send mail to applicant
    sendEmail(applicantsEmail, text, subject);

    // TODO: Make these mails more descriptive, and have more data by fetching from the dbs.

    sendEmail(interviewersEmail, "You have to take an interview on " + dateObj.toString(), "Interviewing Details");
    res.send("Mail has been sent");
});

app.get("/logout", function (req, res) {
    // Destroying the session when we logout
    req.session.destroy();
    res.redirect("/");
});

app.listen(3000, function () {
    console.log("Server listening on port 3000");
});