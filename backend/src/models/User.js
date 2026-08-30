import mongoose from 'mongoose'
import bcrypt from 'bcrypt'

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    /**
     * Absent for accounts created through a social provider — there is no
     * password to hash. Anything reading this must cope with it missing rather
     * than assume every account has one.
     */
    passwordHash: { type: String },

    /**
     * Linked social identities, by provider and that provider's stable user id.
     * Keyed on the id rather than the email: an address can change hands, a
     * provider's subject identifier cannot.
     */
    providers: {
      type: [new mongoose.Schema({
        provider: { type: String, required: true },   // 'google'
        providerId: { type: String, required: true }, // provider's `sub`
        email: String,
        linkedAt: { type: Date, default: Date.now },
      }, { _id: false })],
      default: () => [],
    },

    /** Whether some provider has vouched for the address. Gates auto-linking. */
    emailVerified: { type: Boolean, default: false },

    /**
     * Collected at sign-up for password accounts and required there. Absent on
     * accounts created through a provider, which only hand back a single
     * display name — so nothing may assume both halves are present.
     */
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },

    /** Display name. Composed from the two halves where we collected them. */
    name: String,
    avatarUrl: String,
  },
  { timestamps: true },
)

userSchema.methods.comparePassword = async function (password) {
  // A social-only account has nothing to compare against; say no rather than
  // letting bcrypt decide what an undefined hash means.
  if (!this.passwordHash) return false
  return bcrypt.compare(password, this.passwordHash)
}

/** True when the account can be signed into with a password at all. */
userSchema.methods.hasPassword = function () {
  return Boolean(this.passwordHash)
}

userSchema.statics.hashPassword = async function (password) {
  return bcrypt.hash(password, 12)
}

// One account per provider identity.
userSchema.index({ 'providers.provider': 1, 'providers.providerId': 1 })

export default mongoose.model('User', userSchema)
