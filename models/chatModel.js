const mongoose = require("mongoose");

const chatSchema = new mongoose.Schema({
  chatName: {
    type: String,
    trim: true
  },
  isGroupChat: {
    type: Boolean,
    default: false
  },
  users: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  leftUsers: [
    {
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      },
      leftAt: {
        type: Date,
        default: Date.now
      }
    }
  ],
  latestMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Message",
  },
  groupAdmins: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  ],
  groupImage: {
    url: String,
    publicId: String
  },
},
  { timestamps: true }
);

module.exports = mongoose.model("Chat", chatSchema);