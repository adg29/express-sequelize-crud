import { crud, Action } from '../src'
import { User } from './User'
import { setupApp } from './app'

describe('crud', () => {
  it('should throw an error if calling an unknown action type', async () => {
    expect.assertions(1)

    try {
      await setupApp(crud('/users', User, { actions: ['GEET_LIST' as any] }))
    } catch (error) {
      expect(error.message).toEqual('Unknown action type GEET_LIST')
    }
  })

  it('should not setup a non-specified action', async () => {
    expect.assertions(1)
    const [dataProvider, server] = await setupApp(
      crud('/users', User, { actions: [Action.GET_LIST] })
    )

    try {
      await dataProvider(Action.GET_ONE, 'users', {
        id: 1,
      })
    } catch (error) {
      expect(error.message).toEqual('Not Found')
      server.close()
    }
  })

  it('should not setup a disabled action', async () => {
    expect.assertions(1)
    const [dataProvider, server] = await setupApp(
      crud('/users', User, { disabledActions: [Action.GET_ONE] })
    )

    try {
      await dataProvider(Action.GET_ONE, 'users', {
        id: 1,
      })
    } catch (error) {
      expect(error.message).toEqual('Not Found')
      server.close()
    }
  })

  it('should not setup a disabled action even if the action is listed', async () => {
    expect.assertions(1)
    const [dataProvider, server] = await setupApp(
      crud('/users', User, {
        disabledActions: [Action.GET_ONE],
        actions: [Action.GET_ONE],
      })
    )

    try {
      await dataProvider(Action.GET_ONE, 'users', {
        id: 1,
      })
    } catch (error) {
      expect(error.message).toEqual('Not Found')
      server.close()
    }
  })

  describe('actions', () => {
    const ctx = {
      server: null,
      dataProvider: null,
    }

    beforeEach(async () => {
      const [dataProvider, server] = await setupApp(crud('/users', User))
      ctx.dataProvider = dataProvider
      ctx.server = server
    })

    afterEach(() => {
      ctx.server.close()
    })

    describe('GET_LIST', () => {
      const findAndCountAll = jest.spyOn(User, 'findAndCountAll')
      const findAll = jest.spyOn(User, 'findAll')

      beforeEach(() => {
        jest.resetAllMocks()
      })

      it('should handle pagination and sort', async () => {
        const rows = new Array(5)
          .fill(1)
          .map((_, index) => ({ id: index, email: `${index}@lalilo.com` }))

        findAndCountAll.mockResolvedValue({
          count: 300,
          rows: rows as User[],
        })

        const response = await ctx.dataProvider(Action.GET_LIST, 'users', {
          pagination: { page: 3, perPage: 5 },
          sort: { field: 'name', order: 'DESC' },
          filter: {},
        })

        expect(response.data).toEqual(rows)
        expect(response.total).toEqual(300)
        expect(findAndCountAll).toHaveBeenCalledWith({
          offset: 10,
          limit: 5,
          where: {},
          order: [['name', 'DESC']],
          raw: true,
        })
      })

      it('should handle hooks', async () => {
        const [dataProvider, server] = await setupApp(
          crud('/users', User, {
            hooks: {
              [Action.GET_LIST]: {
                after: items =>
                  items.map(({ id, email }) => ({
                    id,
                    email,
                  })),
              },
            },
          })
        )

        findAndCountAll.mockResolvedValue({
          count: 300,
          rows: new Array(5).fill(1).map((_, index) => ({
            id: index,
            email: `${index}@lalilo.com`,
          })) as User[],
        })

        const response = await dataProvider(Action.GET_LIST, 'users', {
          pagination: { page: 3, perPage: 5 },
          sort: { field: 'name', order: 'DESC' },
          filter: {},
        })

        expect(response.data[0]).toEqual({ id: 0, email: '0@lalilo.com' })
        server.close()
      })

      it('handles search filter', async () => {
        const [dataProvider, server] = await setupApp(
          crud('/users', User, {
            searchableFields: ['email', 'id'],
          })
        )

        findAll.mockResolvedValue([])

        await dataProvider(Action.GET_LIST, 'users', {
          pagination: { page: 0, perPage: 25 },
          sort: { field: 'id', order: 'DESC' },
          filter: { q: 'some search' },
        })
        expect(findAll).toHaveBeenCalledTimes(3)
        server.close()
      })
    })

    describe('GET_ONE', () => {
      const findByPk = jest.spyOn(User, 'findByPk')

      beforeEach(() => {
        findByPk.mockReset()
      })

      it('should call findByPk with the provided id', async () => {
        findByPk.mockResolvedValue({ id: 1, email: 'eloi@lalilo.com' } as User)

        const response = await ctx.dataProvider(Action.GET_ONE, 'users', {
          id: 1,
        })

        expect(response.data).toEqual({ id: 1, email: 'eloi@lalilo.com' })
        expect(findByPk).toHaveBeenCalledWith('1', {
          raw: true,
        })
      })

      it('should throw a 404 when record is not found', async () => {
        expect.assertions(1)

        findByPk.mockResolvedValue(null)

        try {
          await ctx.dataProvider(Action.GET_ONE, 'users', {
            id: 1,
          })
        } catch (error) {
          expect(error.status).toEqual(404)
        }
      })

      it('should handle hooks', async () => {
        const [dataProvider, server] = await setupApp(
          crud('/users', User, {
            actions: Object.values(Action),
            hooks: {
              [Action.GET_ONE]: {
                after: ({ id, email }) => ({
                  id,
                  email,
                }),
              },
            },
          })
        )

        findByPk.mockResolvedValue({ id: 1, email: 'eloi@lalilo.com' } as User)

        const response = await dataProvider(Action.GET_ONE, 'users', {
          id: 1,
        })

        expect(response.data).toEqual({ id: 1, email: 'eloi@lalilo.com' })
        server.close()
      })
    })

    describe('CREATE', () => {
      const create = jest.spyOn(User, 'create')

      beforeEach(() => {
        create.mockReset()
      })

      it('should call create', async () => {
        create.mockResolvedValue({ id: 1 } as any)

        const response = await ctx.dataProvider(Action.CREATE, 'users', {
          data: {
            name: 'Éloi',
          },
        })

        expect(response.data).toEqual({ id: 1, name: 'Éloi' })
        expect(create).toHaveBeenCalledWith(
          { name: 'Éloi' },
          {
            raw: true,
          }
        )
      })

      it('should call create with the result of before hook', async () => {
        const [dataProvider, server] = await setupApp(
          crud('/users', User, {
            hooks: {
              [Action.CREATE]: {
                before: async ({ firstName, ...rest }) => ({
                  ...rest,
                  name: firstName,
                }),
              },
            },
          })
        )
        create.mockResolvedValue({ id: 1 } as any)

        const response = await dataProvider(Action.CREATE, 'users', {
          data: {
            firstName: 'Éloi',
          },
        })

        expect(response.data).toEqual({ id: 1, firstName: 'Éloi' })
        expect(create).toHaveBeenCalledWith(
          { name: 'Éloi' },
          {
            raw: true,
          }
        )
        server.close()
      })
    })

    describe('UPDATE', () => {
      const findByPk = jest.spyOn(User, 'findByPk')
      const update = jest.spyOn(User, 'update').mockResolvedValue(null)

      beforeEach(() => {
        findByPk.mockReset()
        update.mockReset()
      })

      it('should call update', async () => {
        const record = {
          id: 1,
          name: 'Éloi',
        }
        findByPk.mockResolvedValue(record as any)

        const response = await ctx.dataProvider(Action.UPDATE, 'users', {
          id: 1,
          data: {
            name: 'Éloi',
          },
        })

        expect(response.data).toEqual({ name: 'Éloi' })
        expect(update).toHaveBeenCalledWith(
          { name: 'Éloi' },
          { where: { id: '1' } }
        )
      })

      it('should throw a 404 if record is not found', async () => {
        expect.assertions(1)

        findByPk.mockResolvedValue(null)

        try {
          await ctx.dataProvider(Action.UPDATE, 'users', {
            id: 1,
            data: {
              name: 'Éloi',
            },
          })
        } catch (error) {
          expect(error.status).toEqual(404)
        }
      })
    })

    describe('DELETE', () => {
      const destroy = jest.spyOn(User, 'destroy')

      beforeEach(() => {
        destroy.mockReset()
      })

      it('should call destroy', async () => {
        destroy.mockResolvedValue(null)

        const response = await ctx.dataProvider(Action.DELETE, 'users', {
          id: 1,
        })

        expect(response.data).toEqual({ id: '1' })
        expect(destroy).toHaveBeenCalledWith({ where: { id: '1' } })
      })
    })
  })
})
