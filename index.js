const { ApolloServer } = require('@apollo/server')
const { startStandaloneServer } = require('@apollo/server/standalone')
const { GraphQLError } = require('graphql')
const { v4: uuidv4 } = require('uuid')
const jwt = require('jsonwebtoken')

const mongoose = require('mongoose')
const Book = require('./models/book')
const Author = require('./models/author')
const User = require('./models/user')

mongoose.set('strictQuery', false)
require('dotenv').config()

const MONGODB_URI = process.env.MONGODB_URI

console.log('connecting to', MONGODB_URI)
mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('connected to MongoDB')
  })
  .catch((error) => {
    console.log('error connection to MongoDB:', error.message)
  })

const typeDefs = `
  type AuthorDetails {
    name: String!
    born: Int
    id: ID!
    bookCount: Int!
  }

  type Book {
    title: String!
    author: AuthorDetails!
    published: Int!
    genres: [String!]!
    id: ID!
  }

  type User {
    username: String!
    favoriteGenre: String!
    id: ID!
  }

  type Token {
    value: String!
  }

  type Query {
    bookCount: Int!
    authorCount: Int!
    allBooks(author: String, genre: String): [Book!]!
    allAuthors: [AuthorDetails!]!
    me: User
  }

  type Mutation {
    addBook(
      title: String!
      author: String!
      published: Int!
      genres: [String!]!
    ): Book

    editAuthor(
      name: String!
      setBornTo: Int!
    ): AuthorDetails

    createUser(
      username: String!
      favoriteGenre: String!
    ): User

    login(
      username: String!
      password: String!
    ): Token
  }
`
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

      return newBook
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
}

const server = new ApolloServer({
  typeDefs,
  resolvers,
})

startStandaloneServer(server, {
  listen: { port: 4000 },
  context: async ({ req, res }) => {
    const auth = req.headers.authorization ?? null

    if (auth) {
      const decodedToken = jwt.verify(auth, process.env.JWT_SECRET)
      const currentUser = await User.findById(decodedToken.id)
      return { currentUser }
    }
  },
}).then(({ url }) => {
  console.log(`Server ready at ${url}`)
})
