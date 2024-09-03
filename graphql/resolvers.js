const { GraphQLError } = require('graphql')
const { PubSub } = require('graphql-subscriptions')
const jwt = require('jsonwebtoken')

const Book = require('../models/book')
const Author = require('../models/author')
const User = require('../models/user')

const pubsub = new PubSub()

const resolvers = {
  Query: {
    bookCount: async () => {
      const dbBooks = await Book.find({})
      return dbBooks.length
    },
    authorCount: async () => {
      const dbAuthors = await Author.find({})
      return dbAuthors.length
    },
    allBooks: async (root, args) => {
      let books
      const dbBooks = await Book.find({})
      const dbAuthors = await Author.find({})
      const dbAuthor = dbAuthors.find((author) => author.name === args.author)

      if (args.author && args.genre) {
        const byAuthorGenre = dbBooks
          .filter((book) => book.genres.includes(args.genre))
          .filter((book) => dbAuthor._id.equals(book.author))
        books = byAuthorGenre
      } else if (args.author) {
        books = dbBooks.filter((book) => dbAuthor._id.equals(book.author))
      } else if (args.genre) {
        books = dbBooks.filter((book) => book.genres.includes(args.genre))
      } else {
        books = dbBooks
      }

      return books.map((book) => {
        const author = dbAuthors.find((author) =>
          author._id.equals(book.author)
        )
        const authorBooks = dbBooks.filter((book) =>
          author._id.equals(book.author)
        )
        return {
          title: book.title,
          author: {
            name: author.name,
            born: author.born,
            id: author._id,
            bookCount: authorBooks.length,
          },
          published: book.published,
          genres: book.genres,
          id: book._id,
        }
      })
    },
    allAuthors: async () => {
      const dbAuthors = await Author.find({})
      const dbBooks = await Book.find({})

      return [...dbAuthors].map((author) => {
        const authorBooks = dbBooks.filter((book) =>
          author._id.equals(book.author)
        )
        return {
          name: author.name,
          born: author.born,
          bookCount: authorBooks.length,
        }
      })
    },
    me: (root, args, context) => context.currentUser,
  },
  Mutation: {
    addBook: async (root, args, context) => {
      if (!context.currentUser) {
        throw new GraphQLError('Log in first', {
          extensions: {
            code: 'UNAUTHENTICATED',
          },
        })
      }

      let dbFoundAuthor = await Author.findOne({ name: args.author })
      const dbFoundBook = await Book.findOne({ title: args.title })

      if (!dbFoundAuthor) {
        const newAuthor = new Author({ name: args.author })

        try {
          await newAuthor.save()
        } catch (error) {
          throw new GraphQLError('Author name should be 5 or more in length', {
            extensions: {
              code: 'BAD_USER_INPUT',
              invalidArgs: args.author,
            },
          })
        }
        dbFoundAuthor = newAuthor
      }

      if (dbFoundBook) {
        throw new GraphQLError('Book is already added', {
          extensions: {
            code: 'BAD_USER_INPUT',
            invalidArgs: args.title,
          },
        })
      }

      const newBook = new Book({ ...args, author: dbFoundAuthor._id })

      try {
        await newBook.save()
      } catch (error) {
        throw new GraphQLError(
          "Saving book failed. Please refer to this data's corresponding Schema to check which arguments violate rules",
          {
            extensions: {
              code: 'BAD_USER_INPUT',
            },
          }
        )
      }

      pubsub.publish('BOOK_ADDED', { bookAdded: newBook })

      const dbBooks = await Book.find({})
      const authorBooks = dbBooks.filter((book) =>
        dbFoundAuthor._id.equals(book.author)
      )

      return {
        title: newBook.title,
        author: {
          name: dbFoundAuthor.name,
          born: dbFoundAuthor.born,
          id: dbFoundAuthor._id,
          bookCount: authorBooks.length,
        },
        published: newBook.published,
        genres: newBook.genres,
        id: newBook._id,
      }
    },
    editAuthor: async (root, args, context) => {
      if (!context.currentUser) {
        throw new GraphQLError('Log in first', {
          extensions: {
            code: 'UNAUTHENTICATED',
          },
        })
      }

      const dbAuthor = await Author.findOneAndUpdate(
        { name: args.name },
        { born: args.setBornTo },
        { new: true }
      )

      if (!dbAuthor) return null

      const authorBooks = (await Book.find({})).filter(
        (book) => book.author === dbAuthor._id
      )
      return {
        id: dbAuthor._id,
        name: dbAuthor.name,
        born: dbAuthor.born,
        bookCount: authorBooks.length,
      }
    },
    createUser: async (root, args) => {
      const user = new User({ ...args })

      try {
        return await user.save()
      } catch (error) {
        throw new GraphQLError(
          'Creating user failed. Username should be at least 3 characters in length',
          {
            extensions: {
              code: 'BAD_USER_INPUT',
              invalidArgs: args.username,
              error,
            },
          }
        )
      }
    },
    login: async (root, args) => {
      const user = await User.findOne({ username: args.username })

      if (!user || args.password !== 'secret') {
        throw new GraphQLError('Wrong user credentials', {
          extensions: {
            code: 'BAD_USER_INPUT',
          },
        })
      }

      const userForToken = {
        username: user.username,
        id: user._id,
      }

      return { value: jwt.sign(userForToken, process.env.JWT_SECRET) }
    },
  },
  Subscription: {
    bookAdded: {
      subscribe: () => pubsub.asyncIterator('BOOK_ADDED'),
    },
  },
}

module.exports = resolvers
