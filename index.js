const { ApolloServer } = require('@apollo/server')
const { startStandaloneServer } = require('@apollo/server/standalone')
const { GraphQLError } = require('graphql')
const { v4: uuidv4 } = require('uuid')

const mongoose = require('mongoose')
const Book = require('./models/book')
const Author = require('./models/author')

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

let authors = [
  {
    name: 'Robert Martin',
    id: 'afa51ab0-344d-11e9-a414-719c6709cf3e',
    born: 1952,
  },
  {
    name: 'Martin Fowler',
    id: 'afa5b6f0-344d-11e9-a414-719c6709cf3e',
    born: 1963,
  },
  {
    name: 'Fyodor Dostoevsky',
    id: 'afa5b6f1-344d-11e9-a414-719c6709cf3e',
    born: 1821,
  },
  {
    name: 'Joshua Kerievsky', // birthyear not known
    id: 'afa5b6f2-344d-11e9-a414-719c6709cf3e',
  },
  {
    name: 'Sandi Metz', // birthyear not known
    id: 'afa5b6f3-344d-11e9-a414-719c6709cf3e',
  },
]

/*
 * English:
 * It might make more sense to associate a book with its author by storing the author's id in the context of the book instead of the author's name
 * However, for simplicity, we will store the author's name in connection with the book
 */

let books = [
  {
    title: 'Clean Code',
    published: 2008,
    author: '66ceaed15a0fc0bf4425c44d',
    id: 'afa5b6f4-344d-11e9-a414-719c6709cf3e',
    genres: ['refactoring'],
  },
  {
    title: 'Agile software development',
    published: 2002,
    author: '66ceaed15a0fc0bf4425c44d',
    id: 'afa5b6f5-344d-11e9-a414-719c6709cf3e',
    genres: ['agile', 'patterns', 'design'],
  },
  {
    title: 'Refactoring, edition 2',
    published: 2018,
    author: '66ceaed15a0fc0bf4425c44e',
    id: 'afa5de00-344d-11e9-a414-719c6709cf3e',
    genres: ['refactoring'],
  },
  {
    title: 'Refactoring to patterns',
    published: 2008,
    author: '66ceaed15a0fc0bf4425c450',
    id: 'afa5de01-344d-11e9-a414-719c6709cf3e',
    genres: ['refactoring', 'patterns'],
  },
  {
    title: 'Practical Object-Oriented Design, An Agile Primer Using Ruby',
    published: 2012,
    author: '66ceaed15a0fc0bf4425c451',
    id: 'afa5de02-344d-11e9-a414-719c6709cf3e',
    genres: ['refactoring', 'design'],
  },
  {
    title: 'Crime and punishment',
    published: 1866,
    author: '66ceaed15a0fc0bf4425c44f',
    id: 'afa5de03-344d-11e9-a414-719c6709cf3e',
    genres: ['classic', 'crime'],
  },
  {
    title: 'Demons',
    published: 1872,
    author: '66ceaed15a0fc0bf4425c44f',
    id: 'afa5de04-344d-11e9-a414-719c6709cf3e',
    genres: ['classic', 'revolution'],
  },
]

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

  type Query {
    bookCount: Int!
    authorCount: Int!
    allBooks(author: String, genre: String): [Book!]!
    allAuthors: [AuthorDetails!]!
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
  }
`

const resolvers = {
  Query: {
    bookCount: async () => {
      const dbBooks = await Book.find({})
      mongoose.connection.close()
      return dbBooks.length
    },
    authorCount: async () => {
      const dbAuthors = await Author.find({})
      mongoose.connection.close()
      return dbAuthors.length
    },
    allBooks: async (root, args) => {
      const dbBooks = await Book.find({})
      const dbAuthor = await Author.findOne({ name: args.author })
      mongoose.connection.close()

      if (args.author && args.genre) {
        const byAuthorGenre = dbBooks
          .filter((book) => book.genres.includes(args.genre))
          .filter((book) => dbAuthor._id.equals(book.author))

        return byAuthorGenre
      } else if (args.author) {
        return dbBooks.filter((book) => dbAuthor._id.equals(book.author))
      } else if (args.genre) {
        return dbBooks.filter((book) => book.genres.includes(args.genre))
      } else {
        return dbBooks
      }
    },
    allAuthors: async () => {
      const dbAuthors = await Author.find({})
      const dbBooks = await Book.find({})
      mongoose.connection.close()

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
  },
  Mutation: {
    addBook: async (root, args) => {
      const dbFoundAuthor = await Author.findOne({ name: args.author })
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
      mongoose.connection.close()
      return newBook
    },
    editAuthor: async (root, args) => {
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
  },
}

const server = new ApolloServer({
  typeDefs,
  resolvers,
})

startStandaloneServer(server, {
  listen: { port: 4000 },
}).then(({ url }) => {
  console.log(`Server ready at ${url}`)
})
